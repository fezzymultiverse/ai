# scaffold/ - only for a repo that has no Capacitor project files yet

package.json, capacitor.config.json and .gitignore here are a minimal Capacitor 7 setup (appId com.festers.horizon, webDir www,
CapacitorHttp on). The build workflow copies them to the repo root ONLY when the repo has no package.json.
If your repo already has these files, they win and nothing here is used. Never overwrite your own.

Native plugins (V1.99.66): `android-native/` now holds ALL Horizon native plugins and the build workflow installs them with
`scripts/install_native.sh`, so an APK built from this scaffold includes HorizonAI, Media, Perms, Daemon, Termux, Lock, Display,
Check-in, Alarm, Browser, Stats and the Edge voice. Nothing has been compiled or run on a phone: the first GitHub run decides.
