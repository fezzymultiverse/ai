/* Opt-in native WorkManager check-ins. No foreground timer is used to deliver messages. */
(function () {
    'use strict';
    var enabled = false, hours = 4, busy = false, timer = null, lastSnapshot = '', lastSnapshotAt = 0, tail = Promise.resolve();
    var toggle, interval, status;
    function plugin() {
        var c = window.Capacitor;
        return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.HorizonCheckin;
    }
    function paint(message) {
        if (!toggle) return;
        toggle.checked = enabled; interval.value = String(hours);
        toggle.disabled = busy || !plugin(); interval.disabled = busy || !enabled;
        status.textContent = message || (!plugin() ? 'Android build required.' : enabled ? 'On · approximate background timing · notifications only · snapshot refreshed while Horizon is open.' : 'Off · no background requests.');
    }
    function serialized(fn) { tail = tail.catch(function () {}).then(fn); return tail; }
    function report(e) { paint(String(e && e.message || e)); }
    function sync() {
        return serialized(async function () {
            if (!enabled || !plugin() || document.hidden || (window.HzLock && window.HzLock.locked())) return;
            var args = window.HorizonCheckinSnapshot();
            args.enabled = true; args.hours = hours;
            var fingerprint = JSON.stringify(args);
            if (fingerprint === lastSnapshot && Date.now() - lastSnapshotAt < 3600000) return;
            await plugin().configure(args); lastSnapshot = fingerprint; lastSnapshotAt = Date.now();
        });
    }
    function scheduleSync() {
        if (!enabled) return;
        clearTimeout(timer); timer = setTimeout(function () { sync().catch(report); }, 1500);
    }
    async function change(on) {
        if (busy) return;
        if (on && !window.confirm('Enable proactive AI check-ins?\n\nYour selected provider will receive up to 12 recent chat excerpts (600 characters each), using your selected model and key, every chosen interval. A native encrypted snapshot is stored for background use and expires after 7 days without refresh. No Vault, attachments or separate inbox access. Provider limits/billing apply. Android may delay work; force-stop pauses it. Notifications only, no automatic chat opening.')) { paint(); return; }
        var failure = '';
        busy = true; enabled = on; lastSnapshot = ''; paint();
        try {
            if (on) {
                var c = window.Capacitor, perms = c && c.Plugins && c.Plugins.HorizonPerms;
                if (perms && perms.requestNotifications) await perms.requestNotifications();
                await sync();
            } else {
                clearTimeout(timer);
                await serialized(function () { return plugin().configure({ enabled: false }); });
            }
        } catch (e) {
            if (on) { enabled = false; await serialized(function () { return plugin().configure({ enabled: false }); }).catch(function () {}); }
            failure = String(e && e.message || e);
        } finally { busy = false; paint(failure); }
    }
    async function mount() {
        var host = document.getElementById('daemonCard');
        if (!host || document.getElementById('hzCheckinSettings')) return;
        var card = document.createElement('section'); card.id = 'hzCheckinSettings';
        var title = document.createElement('h3'); title.textContent = 'Proactive check-in';
        var label = document.createElement('label'); toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.id = 'hzCheckinToggle';
        label.append(toggle, document.createTextNode(' AI checks in through notifications'));
        var periodLabel = document.createElement('label'); periodLabel.textContent = 'Interval '; interval = document.createElement('select'); interval.id = 'hzCheckinHours';
        [1, 2, 4, 8, 12, 24].forEach(function (h) { var o = document.createElement('option'); o.value = String(h); o.textContent = h + ' hour' + (h === 1 ? '' : 's'); interval.appendChild(o); });
        periodLabel.appendChild(interval); status = document.createElement('p'); status.className = 'hint'; status.setAttribute('aria-live', 'polite');
        card.append(title, label, document.createElement('br'), periodLabel, status); host.appendChild(card);
        toggle.addEventListener('change', function () { change(toggle.checked); });
        interval.addEventListener('change', function () { hours = Number(interval.value); lastSnapshot = ''; sync().then(function () { paint(); }).catch(report); });
        paint();
        var p = plugin(); if (!p) return;
        try { var s = await p.status(); enabled = !!s.enabled; hours = Number(s.hours) || 4; paint(s.notifications === false && enabled ? 'On, but Android notifications are blocked. Enable them in App settings.' : ''); scheduleSync(); } catch (e) { report(e); }
    }
    window.HorizonCheckin = { scheduleSync: scheduleSync };
    document.addEventListener('hz:pick', scheduleSync);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) scheduleSync(); });
    window.addEventListener('horizon-resume', scheduleSync);
    // Only refreshes the encrypted snapshot; background delivery belongs to WorkManager.
    setInterval(scheduleSync, 60000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
