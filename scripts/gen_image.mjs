// Generate a keyframe still: text-to-image, or edit (reference-chained) when
// given reference image files — the continuity backbone of storyboard mode.
// CLI: node gen_image.mjs --prompt "..." --out K0.png [--ref K_prev.png[,K0.png]]
//      [--model bytedance/seedream-v5.0-pro] [--size 2720*1530]
import { loadKey, submitImage, poll, download, parseArgs, fileToDataUrl } from "./atlas.mjs";

export async function generateKeyframe(opts, key) {
  const family = opts.model || "bytedance/seedream-v5.0-pro";
  const refs = (typeof opts.ref === "string" ? opts.ref.split(",") : opts.ref || []).filter(Boolean);
  const model = family.includes("/edit") || family.includes("/text-to-image")
    ? family // caller passed a full variant
    : family + (refs.length ? "/edit" : "/text-to-image");
  // size formats differ per family: seedream "W*H", gpt-image "WxH"
  const isGpt = model.startsWith("openai/");
  const input = {
    model,
    prompt: opts.prompt,
    size: opts.size || (isGpt ? "2048x1152" : "2720*1530"), // native 16:9
    output_format: "png",
  };
  if (isGpt) input.quality = opts.quality || "high";
  if (refs.length) input.images = refs.map(fileToDataUrl);
  const sub = await submitImage(input, key);
  if (!sub.id) throw new Error("submit returned no id: " + JSON.stringify(sub).slice(0, 300));
  console.log(`[${opts.label || sub.id}] submitted (${model}${refs.length ? `, ${refs.length} ref` : ""})`);
  const done = await poll(sub.id, key, {
    label: opts.label || sub.id, intervalMs: 4000,
    onTick: (s, t) => { if (t > 0 && t % 24 < 4) console.log(`[${opts.label || sub.id}] ${s} … ${t}s`); },
  });
  const url = done.outputs?.[0];
  if (!url) throw new Error("completed but no outputs: " + JSON.stringify(done).slice(0, 300));
  await download(url, opts.out);
  console.log(`[${opts.label || sub.id}] saved → ${opts.out}`);
  return { file: opts.out, tokens: done.completion_tokens || 0 };
}

// Batch mode: generate the WHOLE keyframe set in one sequential-model call.
// The model keeps cross-frame consistency internally — faster than chaining
// and immune to copy-of-a-copy drift.
export async function generateKeyframeSet({ keyframes, styleAnchor, outDir, model, size }, key) {
  const n = keyframes.length;
  const prompt =
    `A sequence of ${n} cinematic still frames from one continuous product film. ` +
    `Consistent materials, lighting, palette, style and hero subject across all frames. ` +
    `${styleAnchor || ""}\n` +
    keyframes.map((k, i) => `Frame ${i + 1}: ${k.prompt}`).join("\n");
  const input = { model, prompt, size: size || "2848*1600", output_format: "png", max_images: n };
  const sub = await submitImage(input, key);
  if (!sub.id) throw new Error("submit returned no id: " + JSON.stringify(sub).slice(0, 300));
  console.log(`[keyframes] batch submitted (${model}, ${n} frames)`);
  const done = await poll(sub.id, key, {
    label: "keyframes", intervalMs: 5000,
    onTick: (s, t) => { if (t > 0 && t % 28 < 5) console.log(`[keyframes] ${s} … ${t}s`); },
  });
  const outs = done.outputs || [];
  if (outs.length < n) throw new Error(`sequential model returned ${outs.length}/${n} images — fall back to chain mode or retry`);
  const files = [];
  for (let i = 0; i < n; i++) {
    const f = `${outDir}/${keyframes[i].id}.png`;
    await download(outs[i], f);
    console.log(`[keyframes] saved ${keyframes[i].id}.png`);
    files.push(f);
  }
  return { files, tokens: done.completion_tokens || 0 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.prompt || !a.out) { console.error("usage: node gen_image.mjs --prompt <p> --out <file.png> [--ref prev.png,style.png] [--model --size]"); process.exit(1); }
  generateKeyframe(a, loadKey()).catch(e => { console.error("FAILED:", e.message); process.exit(1); });
}
