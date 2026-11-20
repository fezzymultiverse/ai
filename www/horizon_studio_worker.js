/* Local procedural instrumental renderer. No model, network, credentials or vocals.
   Runs off the UI thread. Produces bounded 44.1 kHz mono PCM WAV. */
'use strict';
self.onmessage = function (event) {
  try {
    const o = event.data || {}, seconds = Math.max(5, Math.min(120, Number(o.seconds) || 30));
    const bpm = Math.max(50, Math.min(180, Number(o.bpm) || 90));
    const rate = 44100, length = Math.round(seconds * rate), buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, length * 2, true);
    const seed = String(o.title || 'Horizon') + String(o.style || 'ambient');
    let rng = 2166136261; for (let i = 0; i < seed.length; i++) rng = Math.imul(rng ^ seed.charCodeAt(i), 16777619) >>> 0;
    const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
    const style = /^(ambient|lofi|electronic)$/.test(o.style) ? o.style : 'ambient';
    const roots = [48, 44, 51, 46], scale = [0, 3, 5, 7, 10, 12, 15], melody = Array.from({length:32}, () => scale[Math.floor(random() * scale.length)]);
    const hz = n => 440 * Math.pow(2, (n - 69) / 12), tau = 2 * Math.PI;
    for (let i = 0; i < length; i++) {
      const t = i / rate, beat = t * bpm / 60, b = Math.floor(beat), phase = beat - b;
      const root = roots[Math.floor(beat / 8) % roots.length], fade = Math.min(1, t / 1.2, (seconds - t) / 1.8);
      const padEnv = Math.min(1, (beat % 8) * 2, (8 - beat % 8) * 2);
      let sample = 0;
      for (const interval of [0, 3, 7]) sample += Math.sin(tau * hz(root + interval) * t + .08 * Math.sin(t * 2)) * .055 * padEnv;
      const step = Math.floor(beat * 2), noteTime = (beat * 2 - step) * 30 / bpm, freq = hz(root + 12 + melody[step % melody.length]);
      sample += (Math.sin(tau * freq * noteTime) + .22 * Math.sin(tau * freq * 2 * noteTime)) * Math.exp(-noteTime * (style === 'ambient' ? 5 : 12)) * .12;
      sample += Math.sin(tau * hz(root - 12) * t) * .12 * Math.exp(-phase * 2);
      if (style !== 'ambient') {
        const dt = phase * 60 / bpm;
        sample += Math.sin(tau * (48 * dt + 2.5 * (1 - Math.exp(-dt * 32)))) * Math.exp(-dt * 20) * .32;
        if (b % 4 === 1 || b % 4 === 3) sample += (random() * 2 - 1) * Math.exp(-dt * 34) * .14;
        const ht = (beat * 2 % 1) * 30 / bpm;
        sample += (random() * 2 - 1) * Math.exp(-ht * 110) * .045;
      }
      const out = Math.tanh(sample * 1.25) * .84 * Math.max(0, fade);
      view.setInt16(44 + i * 2, Math.round(out * 32767), true);
    }
    self.postMessage({buffer, seconds, bpm, style}, [buffer]);
  } catch (e) { self.postMessage({error: String(e.message || e)}); }
};
