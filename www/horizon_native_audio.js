/* Local Android music uses a mediaPlayback foreground service. Browser uploads keep HTMLAudio. */
(function () {
    'use strict';
    window.HorizonAudio = function () {
        const html = new Audio();
        const cap = window.Capacitor;
        let plugin = null;
        try { if (cap && cap.isNativePlatform()) plugin = (cap.Plugins && cap.Plugins.HorizonMedia) || (cap.registerPlugin && cap.registerPlugin('HorizonMedia')); } catch (_) {}
        if (!plugin) return html;
        class NativeAudio extends EventTarget {
            constructor() {
                super(); this.native = false; this._src = ''; this._position = 0; this._duration = 0; this._paused = true; this.loaded = ''; this.track = null;
                this.serial = Promise.resolve(); this.ready = this.listen();
                ['play','pause','ended','error','timeupdate','loadedmetadata'].forEach(name => html.addEventListener(name, () => { if (!this.native) this.dispatchEvent(new Event(name)); }));
                document.addEventListener('visibilitychange', () => { if (!document.hidden && this.native) plugin.state().then(s => this.receive(s)).catch(() => {}); });
            }
            async restore(tracks) {
                await this.ready;
                const state = await plugin.state();
                const track = tracks.find(t => t.id === state.id && !t.tmp);
                if (!track) return null;
                this.track = track; this.native = true; this._src = track.src; this.loaded = track.src;
                this.receive(state); return track.id;
            }
            async listen() {
                await plugin.addListener('mediaState', s => this.receive(s));
                await plugin.addListener('mediaCommand', s => document.dispatchEvent(new CustomEvent('horizon-media-command', { detail: s.action })));
            }
            receive(s) {
                if (!this.native || !s || !s.id || (this.track && s.id !== this.track.id)) return;
                this._position = Number(s.position) || 0; this._duration = Number(s.duration) || 0; this._paused = !!s.paused;
                if (s.event === 'error') { this.loaded = ''; this.lastError = s.message; }
                this.dispatchEvent(new Event(s.event && s.event !== 'state' ? s.event : 'timeupdate'));
            }
            set src(value) {
                const oldNative = this.native; this._src = value; this.loaded = ''; this._position = 0; this._duration = 0; this._paused = true;
                this.native = !!(this.track && this.track.path && !this.track.tmp);
                if (this.native) { html.pause(); html.removeAttribute('src'); if (oldNative) this.serial = this.serial.catch(() => {}).then(() => plugin.pause()).catch(() => {}); }
                else { if (oldNative) this.serial = this.serial.then(() => plugin.stop()).catch(() => {}); html.src = value; }
            }
            get src() { return this._src; }
            get paused() { return this.native ? this._paused : html.paused; }
            get duration() { return this.native ? this._duration : html.duration; }
            get currentTime() { return this.native ? this._position : html.currentTime; }
            set currentTime(value) {
                if (!this.native) { html.currentTime = value; return; }
                this._position = Number(value) || 0;
                const position = this._position;
                this.serial = this.serial.catch(() => {}).then(() => plugin.seek({ position })).catch(() => {});
            }
            async play() {
                if (!this.native) { await this.serial; return html.play(); }
                await this.ready;
                const track = this.track; const src = this._src;
                this.serial = this.serial.catch(() => {}).then(async () => {
                    if (src !== this._src) return;
                    if (this.loaded !== src) {
                        const p = (cap.Plugins && cap.Plugins.HorizonPerms) || (cap.registerPlugin && cap.registerPlugin('HorizonPerms'));
                        // Notifications are requested at the user's first playback action, not on app launch.
                        try { const st = await p.notificationsEnabled(); if (!st.enabled && !this.askedNotifications) { this.askedNotifications = true; await p.requestNotifications(); } } catch (_) {}
                        await plugin.play({ source: /^(content|file):\/\//.test(track.path) ? track.path : 'file://' + track.path, id: track.id, title: track.title, artist: track.artist, album: track.album });
                        this.loaded = src;
                    } else await plugin.play({});
                });
                return this.serial;
            }
            pause() {
                if (!this.native) return html.pause();
                this._paused = true;
                this.serial = this.serial.catch(() => {}).then(() => plugin.pause()).catch(() => {});
            }
        }
        return new NativeAudio();
    };
})();
