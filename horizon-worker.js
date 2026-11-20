// horizon-worker.js  V2  ·  Cloudflare Worker -> Workers AI (OpenAI-style)
// Routes: GET /v1/models · POST /v1/chat/completions · GET / (health)
// Needs ONE binding: Workers AI, variable name AI.

const MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/meta/llama-3.2-1b-instruct",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-3-12b-it",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/qwen/qwq-32b",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "@cf/ibm-granite/granite-4.0-h-micro",
];

const MAX_TOKENS_CAP = 2048;     // hard ceiling per reply, protects the daily neuron allowance
const MAX_BODY_BYTES = 200000;   // reject giant prompts before they cost anything

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const err = (status, message) =>
  json({ error: { message, type: "worker_error", code: status } }, status);

function textOf(out) {
  if (out == null) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response === "object") return JSON.stringify(out.response);
  const c = out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
  if (Array.isArray(c)) return c.map((p) => p.text || "").join("");
  return typeof c === "string" ? c : "";
}

function usageOf(out) {
  const u = (out && out.usage) || {};
  const p = Number(u.prompt_tokens || 0);
  const c = Number(u.completion_tokens || 0);
  return { prompt_tokens: p, completion_tokens: c, total_tokens: Number(u.total_tokens || p + c) };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/" && request.method === "GET") {
      return json({ ok: true, name: "horizon-worker", ai: !!(env && env.AI), models: MODELS.length });
    }

    if (path === "/v1/models" && request.method === "GET") {
      return json({
        object: "list",
        data: MODELS.map((id) => ({ id, object: "model", owned_by: "cloudflare" })),
      });
    }

    if (path === "/v1/chat/completions" && request.method === "POST") {
      if (!env || !env.AI) return err(500, "Workers AI binding missing. Add a binding named AI.");

      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return err(413, "Request too large.");

      let body;
      try { body = JSON.parse(raw); } catch (_) { return err(400, "Body must be JSON."); }

      const model = String(body.model || "");
      if (!MODELS.includes(model)) return err(400, "Model not allowed: " + (model || "(none)"));

      const messages = Array.isArray(body.messages) ? body.messages : null;
      if (!messages || !messages.length) return err(400, "messages is required.");

      const clean = messages.map((m) => ({
        role: ["system", "user", "assistant"].includes(m && m.role) ? m.role : "user",
        content: Array.isArray(m && m.content)
          ? m.content.map((p) => (p && p.text) || "").join("")
          : String((m && m.content) == null ? "" : m.content),
      }));

      const max = Math.min(Math.max(parseInt(body.max_tokens, 10) || 512, 1), MAX_TOKENS_CAP);
      const params = { messages: clean, max_tokens: max, stream: false };
      if (typeof body.temperature === "number") params.temperature = Math.min(Math.max(body.temperature, 0), 2);

      let out;
      try {
        out = await env.AI.run(model, params);
      } catch (e) {
        const msg = String((e && e.message) || e).slice(0, 300);
        const status = /429|rate|limit|quota|neuron/i.test(msg) ? 429 : 502;
        return err(status, msg);
      }

      const text = textOf(out);
      const usage = usageOf(out);
      const hitCap = usage.completion_tokens >= max;

      return json({
        id: "chatcmpl-" + crypto.randomUUID(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model, // always the model that was asked for; the app refuses substitutions
        choices: [{
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: hitCap ? "length" : "stop",
        }],
        usage,
      });
    }

    return err(404, "Not found. Use GET /v1/models or POST /v1/chat/completions.");
  },
};
