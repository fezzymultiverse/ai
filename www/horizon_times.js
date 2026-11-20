/* Relative age plus exact local time, shared by all chat types. */
(function (root) {
    'use strict';
    function clock(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); }
    function age(ts, now) { var mins = Math.floor(Math.max(0, (now == null ? Date.now() : now) - ts) / 60000); if (mins < 1) return 'Just now'; if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago'); var hours = Math.floor(mins / 60); if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago'); var days = Math.floor(hours / 24); return days + (days === 1 ? ' day ago' : ' days ago'); }
    function text(ts, prefix, now) { return (prefix || '') + clock(ts) + ' · ' + age(ts, now); }
    function bind(node, ts, prefix) { if (!Number.isFinite(ts)) return; node.dataset.hzTime = ts; node.dataset.hzTimePrefix = prefix || ''; node.textContent = text(ts, prefix); node.title = new Date(ts).toLocaleString(); }
    function refresh() { if (typeof document === 'undefined') return; document.querySelectorAll('[data-hz-time]').forEach(function(n) { var t = text(Number(n.dataset.hzTime), n.dataset.hzTimePrefix); if (n.dataset.hzTimeSuffix) t += n.dataset.hzTimeSuffix; if (n.textContent !== t) n.textContent = t; }); }
    root.HorizonTimes = { clock: clock, age: age, text: text, bind: bind, refresh: refresh };
    if (typeof module !== 'undefined') module.exports = root.HorizonTimes;
    if (typeof document !== 'undefined') setInterval(refresh, 30000);
})(typeof window !== 'undefined' ? window : globalThis);
