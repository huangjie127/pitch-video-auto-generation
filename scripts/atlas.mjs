// Shared Atlas Cloud API client. Zero deps (Node 18+ global fetch).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.ATLAS_CLOUD_BASE_URL || "https://api.atlascloud.ai";

export function loadKey(cwd = process.cwd()) {
  if (process.env.ATLAS_CLOUD_API_KEY) return process.env.ATLAS_CLOUD_API_KEY;
  for (const dir of [cwd, dirname(cwd)]) {
    try {
      const env = readFileSync(`${dir}/.env`, "utf8");
      const m = env.match(/^\s*ATLAS_CLOUD_API_KEY\s*=\s*(\S+)/m);
      if (m) return m[1];
    } catch {}
  }
  throw new Error("ATLAS_CLOUD_API_KEY not found (env var or .env in working directory)");
}

async function api(path, { method = "GET", body, key } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  // some endpoints wrap payloads in {code,data}; predictions come bare
  return json.data && (json.code !== undefined) ? json.data : json;
}

export async function submitVideo(input, key) {
  return api("/api/v1/model/generateVideo", { method: "POST", body: input, key });
}
export async function submitAudio(input, key) {
  return api("/api/v1/model/generateAudio", { method: "POST", body: input, key });
}
// image models: schemas declare generateVideo as the submit path (doc quirk);
// try the natural generateImage first, fall back.
export async function submitImage(input, key) {
  try { return await api("/api/v1/model/generateImage", { method: "POST", body: input, key }); }
  catch (e) {
    if (/HTTP (404|405)/.test(e.message)) return api("/api/v1/model/generateVideo", { method: "POST", body: input, key });
    throw e;
  }
}
export async function getPrediction(id, key) {
  // prediction/ is the canonical poll path; some model families use result/
  try { return await api(`/api/v1/model/prediction/${id}`, { key }); }
  catch (e) {
    if (/HTTP 404/.test(e.message)) return api(`/api/v1/model/result/${id}`, { key });
    throw e;
  }
}

export async function poll(id, key, { intervalMs = 7000, timeoutMs = 20 * 60 * 1000, label = id, onTick } = {}) {
  const t0 = Date.now();
  let netFails = 0;
  for (;;) {
    let p;
    try {
      p = await getPrediction(id, key);
      netFails = 0;
    } catch (e) {
      // gateway hiccups (502/503/504) and network blips during polling must
      // not kill the job — the generation is still running server-side
      if (++netFails <= 5 && /HTTP 50[234]|fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(e.message)) {
        console.log(`[${label}] poll hiccup (${netFails}/5) — retrying in ${intervalMs / 1000}s`);
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }
      throw e;
    }
    const status = p.status;
    if (onTick) onTick(status, Math.round((Date.now() - t0) / 1000));
    if (status === "completed") return p;
    if (status === "failed" || status === "timeout") {
      const detail = p.error ?? p.meta_info ?? p;
      throw new Error(`${label}: generation ${status} — ${JSON.stringify(detail).slice(0, 800)}`);
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label}: polling timed out after ${timeoutMs / 1000}s (status=${status})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url.slice(0, 80)}… → HTTP ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// crude $ estimate per model (video: per second; music: per track; image: per frame);
// live prices: GET /api/v1/models
export const RATE = {
  "bytedance/seedance-2.0/text-to-video": 0.09,
  "bytedance/seedance-2.0/image-to-video": 0.09,
  "bytedance/seedance-2.0-fast/text-to-video": 0.072,
  "bytedance/seedance-2.0-fast/image-to-video": 0.072,
  "bytedance/seedance-2.0-mini/text-to-video": 0.045,
  "bytedance/seedance-2.0-mini/image-to-video": 0.045,
  "minimax/music-2.6": 0.15,
  "suno/chirp-v5": 0.132,
  "bytedance/seedream-v5.0-pro/text-to-image": 0.045,
  "bytedance/seedream-v5.0-pro/edit": 0.045,
  "bytedance/seedream-v5.0-lite/edit": 0.032,
  "bytedance/seedream-v5.0-lite": 0.032,
};

// transient upstream failures ("resource has been exhausted", 429s, timeouts)
// deserve an automatic retry before surfacing to the user
export async function withRetry(fn, { tries = 3, delayMs = 20000, label = "" } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const transient = /exhausted|rate.?limit|overload|capacity|429|timed? ?out|temporar|unavailable/i.test(e.message);
      if (i < tries - 1 && transient) {
        console.log(`[retry] ${label} hit a transient failure — retrying in ${delayMs / 1000}s (${i + 1}/${tries - 1})`);
        await new Promise(r => setTimeout(r, delayMs));
      } else throw e;
    }
  }
  throw last;
}

export function fileToDataUrl(path) {
  const buf = readFileSync(path);
  const mime = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(argv[i]);
  }
  return args;
}
