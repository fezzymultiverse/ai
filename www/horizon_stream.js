/* Horizon transport primitives. No credentials, UI state or network dependencies. */
(function (root) {
  'use strict';
  function parser(emit) {
    var carry = '', data = [];
    function flush() { if (data.length) { var p = data.join('\n'); data = []; if (p !== '[DONE]') emit(p); } }
    function line(s) {
      if (!s) return flush();
      if (s[0] === ':') return;
      if (s === 'data' || s.indexOf('data:') === 0) data.push(s === 'data' ? '' : s.slice(5).replace(/^ /, ''));
    }
    function push(text, done) {
      carry += text;
      var m;
      while ((m = /\r\n|\r|\n/.exec(carry))) {
        // A CR at the chunk boundary may be the first half of CRLF.
        if (!done && m[0] === '\r' && m.index === carry.length - 1) break;
        line(carry.slice(0, m.index)); carry = carry.slice(m.index + m[0].length);
      }
      if (done) { if (carry) line(carry); carry = ''; flush(); }
    }
    return { push: push };
  }
  function join(kind, payloads) {
    var error = null, errorStatus = 502, seen = 0, terminal = false;
    var content = '', reasoning = '', finish = '', usage = {}, model = '', parts = [], fb, tcs = [];
    var inTok = 0, outTok = 0;
    payloads.forEach(function (pl) {
      var j;
      try { j = typeof pl === 'string' ? JSON.parse(pl) : pl; } catch (_) { error = 'Malformed provider stream'; return; }
      if (!j || typeof j !== 'object') { error = 'Malformed provider event'; return; }
      seen++;
      if (j.error || j.type === 'error') {
        var e = j.error || j;
        error = typeof e === 'string' ? e : e.message || 'Provider stream failed';
        var code = Number(e.code || e.status); if (code >= 400 && code <= 599) errorStatus = code;
        return;
      }
      if (j.model) model = j.model;
      if (kind === 'gemini') {
        if (j.usageMetadata) usage = j.usageMetadata;
        if (j.promptFeedback) fb = j.promptFeedback;
        var c = j.candidates && j.candidates[0];
        if (!c) return;
        if (c.finishReason) { finish = c.finishReason; terminal = true; }
        ((c.content && c.content.parts) || []).forEach(function (p) {
          var last = parts[parts.length - 1];
          if (typeof p.text === 'string' && last && typeof last.text === 'string' && !!last.thought === !!p.thought) last.text += p.text;
          else parts.push(Object.assign({}, p));
        });
      } else if (kind === 'cohere') {
        if (j.type === 'content-delta') content += j.delta && j.delta.message && j.delta.message.content && j.delta.message.content.text || '';
        if (j.type === 'message-end') {
          terminal = true; finish = j.delta && j.delta.finish_reason || '';
          usage = j.delta && j.delta.usage || j.usage || {};
        }
      } else if (kind === 'anthropic') {
        if (j.type === 'message_start') { inTok = Number(j.message && j.message.usage && j.message.usage.input_tokens) || 0; model = j.message && j.message.model || model; }
        if (j.type === 'content_block_start' && j.content_block && j.content_block.type === 'text') content += j.content_block.text || '';
        if (j.type === 'content_block_delta') { content += j.delta && j.delta.text || ''; reasoning += j.delta && j.delta.thinking || ''; }
        if (j.type === 'message_delta') { finish = j.delta && j.delta.stop_reason || finish; if (j.usage && j.usage.output_tokens != null) outTok = j.usage.output_tokens; }
        if (j.type === 'message_stop') terminal = true;
      } else {
        usage = j.x_groq && j.x_groq.usage || j.usage || usage;
        var ch = j.choices && j.choices[0]; if (!ch) return;
        if (ch.finish_reason) { finish = ch.finish_reason; terminal = true; }
        var d = ch.delta || ch.message || {};
        if (typeof d.content === 'string') content += d.content;
        else if (Array.isArray(d.content)) content += d.content.map(function (p) { return p.text || ''; }).join('');
        reasoning += d.reasoning || d.reasoning_content || '';
        (d.tool_calls || []).forEach(function (t) {
          var k = t.index == null ? 0 : t.index;
          if (!Number.isInteger(k) || k < 0 || k > 127) { error = 'Invalid streamed tool index'; return; }
          var cur = tcs[k] || (tcs[k] = { id: '', type: 'function', function: { name: '', arguments: '' } });
          if (t.id) cur.id = t.id;
          if (t.function) { cur.function.name += t.function.name || ''; cur.function.arguments += t.function.arguments || ''; }
        });
      }
    });
    if (error) return { err: error, status: errorStatus };
    if (!seen) return { err: 'Empty provider stream', status: 502 };
    if (!terminal && !(kind === 'gemini' && fb && fb.blockReason)) return { err: 'Provider stream ended before completion. Retry; no complete answer was received.', status: 502 };
    if (kind === 'gemini') return { obj: { model: model, candidates: [{ content: { role: 'model', parts: parts }, finishReason: finish }], usageMetadata: usage, promptFeedback: fb } };
    if (kind === 'cohere') return { obj: { model: model, message: { content: [{ type: 'text', text: content }] }, finish_reason: finish, usage: usage } };
    if (kind === 'anthropic') return { obj: { model: model, content: [{ type: 'text', text: content }], stop_reason: finish, usage: { input_tokens: inTok, output_tokens: outTok } } };
    var message = { role: 'assistant', content: content, reasoning: reasoning };
    if (tcs.length) message.tool_calls = tcs.filter(Boolean);
    return { obj: { model: model, choices: [{ message: message, finish_reason: finish }], usage: usage } };
  }
  var api = { parser: parser, join: join };
  root.HorizonStream = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
