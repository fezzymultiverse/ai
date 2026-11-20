package com.festers.horizon.stats

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.StatFs
import android.os.SystemClock
import android.telephony.*
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import java.util.UUID
import kotlin.concurrent.thread

/** Privacy-scoped telemetry. No QUERY_ALL_PACKAGES, root, hardware IDs, hidden-IP probes or external-file deletion. */
@CapacitorPlugin(name = "HorizonStats", permissions = [
    Permission(alias = "location", strings = [Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION])
])
class HorizonStatsPlugin : Plugin() {
    private var previousCpu = Process.getElapsedCpuTime()
    private var previousWall = SystemClock.elapsedRealtime()
    private val processStart = if (Build.VERSION.SDK_INT >= 24) Process.getStartElapsedRealtime() else SystemClock.elapsedRealtime()
    private data class Candidate(val path: String, val size: Long, val modified: Long)
    @Volatile private var scanToken = ""
    private val cacheLock = Any()
    private var scanAt = 0L
    private var candidates = emptyList<Candidate>()

    // ---- V1.99.66: merged from the old Java HorizonStatsPlugin (both used the Capacitor name "HorizonStats", so only one could ever load).
    // horizon_dash.js needs: snapshot keys ramAvail/storTotal/storFree/batPct/batCharging/batTempC/cpuSys/cpuApp/cores/vpn/netType/netOnline/netMetered,
    // plus startWatch() and the "netChange" event. horizon_stats.js needs the keys above in snapshot() and requestDetails/scanCache/clearCache.
    private var lastBusy = -1L
    private var lastTotal = -1L
    private var lastProcCpu = -1L
    private var lastWall = -1L
    private var watcher: ConnectivityManager.NetworkCallback? = null
    private val mainH = Handler(Looper.getMainLooper())
    private val pushNet = Runnable {
        try { notifyListeners("netChange", netInfo()) } catch (_: Exception) { /* bridge gone */ }
    }

    @Synchronized
    private fun sysCpuPercent(): Int {
        var r: BufferedReader? = null
        try {
            r = BufferedReader(FileReader("/proc/stat"))
            val line = r.readLine() ?: return -1
            if (!line.startsWith("cpu")) return -1
            val p = line.trim().split(Regex("\\s+"))
            var total = 0L
            var idle = 0L
            var i = 1
            while (i < p.size && i <= 8) {
                val v = p[i].toLong()
                total += v
                if (i == 4 || i == 5) idle += v
                i++
            }
            val busy = total - idle
            var out = -1
            if (lastTotal >= 0 && total > lastTotal) {
                out = Math.round(100.0 * (busy - lastBusy) / (total - lastTotal).toDouble()).toInt().coerceIn(0, 100)
            }
            lastBusy = busy
            lastTotal = total
            return out
        } catch (_: Exception) {
            return -1
        } finally {
            try { r?.close() } catch (_: Exception) { /* nothing to close */ }
        }
    }

    @Synchronized
    private fun appCpuPercent(): Int {
        val cpu = Process.getElapsedCpuTime()
        val wall = SystemClock.elapsedRealtime()
        var out = -1
        if (lastWall >= 0 && wall > lastWall) {
            val cores = Math.max(1, Runtime.getRuntime().availableProcessors())
            out = Math.round(100.0 * (cpu - lastProcCpu) / ((wall - lastWall) * cores).toDouble()).toInt().coerceIn(0, 100)
        }
        lastProcCpu = cpu
        lastWall = wall
        return out
    }

    @Suppress("DEPRECATION")
    private fun vpnUp(): Boolean {
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            for (n in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(n)
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true
            }
        } catch (_: Exception) { /* permission missing or service unavailable: report "no VPN seen" */ }
        return false
    }

    /** type = the physical link under any VPN (wifi, cellular, ethernet, other, none). */
    @Suppress("DEPRECATION")
    private fun netInfo(): JSObject {
        val o = JSObject()
        var vpn = false
        var type = "none"
        var online = false
        var metered = false
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            for (n in cm.allNetworks) {
                val c = cm.getNetworkCapabilities(n) ?: continue
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) { vpn = true; continue }
                if (!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
                val ok = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                if (ok || type == "none") {
                    type = when {
                        c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                        c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                        c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                        else -> "other"
                    }
                    online = online || ok
                    metered = !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                }
            }
        } catch (_: Exception) { /* report what we have */ }
        o.put("vpn", vpn)
        o.put("netType", type)
        o.put("netOnline", online)
        o.put("netMetered", metered)
        return o
    }

    /** Pushes a "netChange" event the moment Wi-Fi, mobile data or a VPN comes or goes (debounced 500 ms). */
    @PluginMethod
    @Synchronized
    fun startWatch(call: PluginCall) {
        try {
            if (watcher == null) {
                val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                val cb = object : ConnectivityManager.NetworkCallback() {
                    private fun kick() { mainH.removeCallbacks(pushNet); mainH.postDelayed(pushNet, 500) }
                    override fun onAvailable(network: Network) { kick() }
                    override fun onLost(network: Network) { kick() }
                    override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { kick() }
                }
                cm.registerNetworkCallback(NetworkRequest.Builder().build(), cb)
                watcher = cb
            }
            val o = netInfo()
            o.put("watching", watcher != null)
            call.resolve(o)
        } catch (e: Exception) {
            call.reject("Watch failed: " + e.message)
        }
    }

    @Synchronized
    override fun handleOnDestroy() {
        try {
            val w = watcher
            if (w != null) {
                (context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(w)
                watcher = null
            }
            mainH.removeCallbacks(pushNet)
        } catch (_: Exception) { /* already unregistered */ }
        super.handleOnDestroy()
    }

    private fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
    private fun background(call: PluginCall, task: () -> JSObject) {
        thread(start = true, isDaemon = true, name = "horizon-stats") {
            try { call.resolve(task()) } catch (e: Exception) { call.reject(e.message ?: "Device data unavailable") }
        }
    }
    @PluginMethod
    fun requestDetails(call: PluginCall) { requestPermissionForAlias("location", call, "detailsResult") }
    @PermissionCallback
    private fun detailsResult(call: PluginCall) { call.resolve(JSObject().put("locationGranted", granted(Manifest.permission.ACCESS_FINE_LOCATION))) }

    @PluginMethod
    fun snapshot(call: PluginCall) = background(call) {
        val out = JSObject()
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
        out.put("ramTotal", mi.totalMem); out.put("ramAvailable", mi.availMem)
        val appMem = Debug.MemoryInfo(); Debug.getMemoryInfo(appMem)
        out.put("processRamBytes", appMem.totalPss.toLong() * 1024)
        val now = SystemClock.elapsedRealtime(); val cpu = Process.getElapsedCpuTime()
        synchronized(this) {
            if (now > previousWall) out.put("processCpuPct", Math.round((cpu - previousCpu) * 1000.0 / (now - previousWall) / Runtime.getRuntime().availableProcessors()).toDouble() / 10)
            previousWall = now; previousCpu = cpu
        }
        out.put("cpuCores", Runtime.getRuntime().availableProcessors())
        out.put("uptimeMs", now); out.put("appRuntimeMs", now - processStart)
        out.put("device", "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}")
        val disk = StatFs(context.filesDir.absolutePath)
        out.put("diskTotal", disk.totalBytes); out.put("diskFree", disk.availableBytes)
        val b = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (b != null) {
            val scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            if (scale > 0 && level >= 0) out.put("batteryPct", Math.round(level * 100.0 / scale))
            if (b.hasExtra(BatteryManager.EXTRA_TEMPERATURE)) out.put("batteryTempC", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0)
            val status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            if (status >= 0) out.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
        }
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        out.put("powerSaver", power.isPowerSaveMode)
        if (Build.VERSION.SDK_INT >= 29) {
            out.put("thermalStatus", arrayOf("None", "Light", "Moderate", "Severe", "Critical", "Emergency", "Shutdown").getOrNull(power.currentThermalStatus) ?: "Unknown")
        }
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            if (caps != null) {
                out.put("vpn", caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))
                out.put("networkType", when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                    else -> "Other"
                })
                out.put("linkDownstreamKbps", caps.linkDownstreamBandwidthKbps)
                if (Build.VERSION.SDK_INT >= 24) out.put("dataSaver", when (cm.restrictBackgroundStatus) {
                    ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED -> "Data Saver on"
                    ConnectivityManager.RESTRICT_BACKGROUND_STATUS_WHITELISTED -> "Data Saver on · Horizon exempt"
                    else -> "Data Saver off"
                })
                val links = cm.getLinkProperties(cm.activeNetwork)
                val address = links?.linkAddresses?.firstOrNull { it.address is java.net.Inet4Address && !it.address.isLoopbackAddress }
                if (address != null) out.put("localIp", address.address.hostAddress)
            }
        } catch (_: SecurityException) { /* field remains unavailable */ }
        // horizon_dash.js keys (same names the old Java plugin used)
        out.put("ramAvail", mi.availMem)
        try {
            val fs = StatFs(Environment.getDataDirectory().path)
            out.put("storTotal", fs.totalBytes); out.put("storFree", fs.availableBytes)
        } catch (_: Exception) { /* storage figures stay unavailable */ }
        if (b != null) {
            val bl = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1); val bs = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val bst = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1); val bt = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
            if (bl >= 0 && bs > 0) out.put("batPct", Math.round(100f * bl / bs))
            out.put("batCharging", bst == BatteryManager.BATTERY_STATUS_CHARGING || bst == BatteryManager.BATTERY_STATUS_FULL)
            if (bt > 0) out.put("batTempC", bt / 10.0)
        }
        out.put("cpuSys", sysCpuPercent()); out.put("cpuApp", appCpuPercent()); out.put("cores", Runtime.getRuntime().availableProcessors())
        val ni = netInfo()
        out.put("vpn", ni.optBoolean("vpn", false))
        out.put("netType", ni.getString("netType")); out.put("netOnline", ni.optBoolean("netOnline", false)); out.put("netMetered", ni.optBoolean("netMetered", false))
        val location = granted(Manifest.permission.ACCESS_FINE_LOCATION)
        out.put("locationGranted", location)
        if (location && call.getBoolean("details", false) == true) {
            try {
                @Suppress("DEPRECATION")
                val wifi = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
                @Suppress("DEPRECATION")
                val ssid = wifi?.ssid?.trim('"')
                if (!ssid.isNullOrBlank() && ssid != "<unknown ssid>") out.put("ssid", ssid)
            } catch (_: Exception) { /* denied by OS */ }
            try {
                val tel = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                @Suppress("DEPRECATION")
                val cell = tel.allCellInfo?.firstOrNull { it.isRegistered }
                val detail = when (cell) {
                    is CellInfoLte -> "LTE · CI ${cell.cellIdentity.ci} · TAC ${cell.cellIdentity.tac} · ${cell.cellSignalStrength.dbm} dBm"
                    is CellInfoGsm -> "GSM · CID ${cell.cellIdentity.cid} · LAC ${cell.cellIdentity.lac} · ${cell.cellSignalStrength.dbm} dBm"
                    is CellInfoWcdma -> "WCDMA · CID ${cell.cellIdentity.cid} · LAC ${cell.cellIdentity.lac} · ${cell.cellSignalStrength.dbm} dBm"
                    else -> if (Build.VERSION.SDK_INT >= 29 && cell is CellInfoNr) {
                        val id = cell.cellIdentity as CellIdentityNr
                        "5G NR · NCI ${id.nci} · TAC ${id.tac} · ${cell.cellSignalStrength.dbm} dBm"
                    } else null
                }
                if (detail != null) out.put("cellTower", detail + " · " + tel.networkOperatorName)
            } catch (_: Exception) { /* unsupported, permission denied or no service */ }
        }
        val apps = JSArray()
        // Modern Android generally returns only this app's processes. Do not claim this is a full task manager.
        for (process in (am.runningAppProcesses ?: emptyList()).take(30)) {
            val a = JSObject(); a.put("name", process.processName)
            try { val mem = am.getProcessMemoryInfo(intArrayOf(process.pid)).firstOrNull(); if (mem != null && mem.totalPss > 0) a.put("ramBytes", mem.totalPss.toLong() * 1024) } catch (_: Exception) {}
            val pkg = process.pkgList?.firstOrNull()
            if (pkg != null) try {
                @Suppress("DEPRECATION")
                val info = context.packageManager.getApplicationInfo(pkg, 0)
                a.put("name", context.packageManager.getApplicationLabel(info).toString())
                a.put("codeBytes", File(info.sourceDir).length() + (info.splitSourceDirs?.sumOf { File(it).length() } ?: 0L))
            } catch (_: Exception) {}
            apps.put(a)
        }
        out.put("apps", apps); out
    }

    private fun transientRoot(): File {
        val root = File(context.cacheDir, "horizon-transient").canonicalFile
        require(root.path.startsWith(context.cacheDir.canonicalPath + File.separator)) {
            "Transient cache root is outside the private cache"
        }
        return root
    }
    private fun allowed(file: File, root: File = transientRoot()): Boolean {
        val canonical = file.canonicalPath
        // Dedicated disposable cache only, never filesDir, preferences, databases,
        // private audio streams, external downloads or user-selected documents.
        return canonical.startsWith(context.cacheDir.canonicalPath + File.separator) &&
            canonical.startsWith(root.path + File.separator)
    }
    @PluginMethod
    fun scanCache(call: PluginCall) = background(call) {
        synchronized(cacheLock) {
            val root = transientRoot()
            val oldOnly = call.getBoolean("oldOnly", false) ?: false
            val cutoff = System.currentTimeMillis() - 7L * 86400000
            val found = root.walkTopDown().onEnter { it.canonicalFile == root || allowed(it, root) }
                .filter { it.isFile && allowed(it, root) && (!oldOnly || it.lastModified() < cutoff) }
                .take(10001).map { Candidate(it.canonicalPath, it.length(), it.lastModified()) }.toList()
            if (found.size > 10000) throw Exception("More than 10000 cache files; scan stopped without enabling deletion")
            val token = UUID.randomUUID().toString()
            candidates = found; scanToken = token; scanAt = SystemClock.elapsedRealtime()
            JSObject().put("token", token).put("count", found.size).put("bytes", found.sumOf { it.size })
                .put("scope", "private cache/horizon-transient only")
        }
    }
    @PluginMethod
    fun clearCache(call: PluginCall) = background(call) {
        synchronized(cacheLock) {
            if (scanToken.isEmpty() || call.getString("token") != scanToken || SystemClock.elapsedRealtime() - scanAt > 300000) {
                throw Exception("Scan expired; scan again before confirming")
            }
            val am = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            if (am.isMusicActive) throw Exception("Stop audio before clearing app cache")
            val list = candidates
            scanToken = ""; candidates = emptyList()
            val root = transientRoot()
            var count = 0; var bytes = 0L
            for (c in list) {
                val f = File(c.path)
                // Immutable reviewed metadata: replaced/modified cache files are skipped.
                if (allowed(f, root) && f.isFile && f.length() == c.size && f.lastModified() == c.modified && f.delete()) {
                    count++; bytes += c.size
                }
            }
            JSObject().put("count", count).put("bytes", bytes).put("skipped", list.size - count)
        }
    }
}
