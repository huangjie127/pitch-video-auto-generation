// Generate one video shot: submit → poll → download.
// Text-to-video by default; pass firstFrame/lastFrame image files for
// keyframe-conditioned image-to-video (storyboard mode).
// CLI: node gen_video.mjs --prompt "Shot: ..." --out shot.mp4
//      [--model bytedance/seedance-2.0/text-to-video] [--duration 5]
//      [--res 1080p] [--ratio 16:9] [--seed -1] [--audio]
//      [--first K0.png] [--last K1.png]
import { loadKey, submitVideo, poll, download, parseArgs, fileToDataUrl } from "./atlas.mjs";

export async function generateShot(opts, key) {
  const first = opts.firstFrame || opts.first;
  const last = opts.lastFrame || opts.last;
  let model = opts.model || "bytedance/seedance-2.0/text-to-video";
  if (first && model.endsWith("/text-to-video")) model = model.replace("/text-to-video", "/image-to-video");
  const input = {
    model,
    prompt: opts.prompt,
    duration: Number(opts.duration ?? 5),
    resolution: opts.res || "1080p",
    ratio: opts.ratio || "16:9",
    generate_audio: !!opts.audio,
    watermark: false,
    seed: Number(opts.seed ?? -1),
  };
  if (first) input.image = fileToDataUrl(first);
  if (last) input.last_image = fileToDataUrl(last);
  const sub = await submitVideo(input, key);
  if (!sub.id) throw new Error("submit returned no id: " + JSON.stringify(sub).slice(0, 300));
  console.log(`[${opts.label || sub.id}] submitted (${input.model}, ${input.duration}s ${input.resolution})`);
  const done = await poll(sub.id, key, {
    label: opts.label || sub.id,
    onTick: (s, t) => { if (t % 28 < 7) console.log(`[${opts.label || sub.id}] ${s} … ${t}s`); },
  });
  const url = done.outputs?.[0];
  if (!url) throw new Error("completed but no outputs: " + JSON.stringify(done).slice(0, 300));
  await download(url, opts.out);
  console.log(`[${opts.label || sub.id}] saved → ${opts.out} (tokens: ${done.completion_tokens ?? "?"})`);
  return { file: opts.out, tokens: done.completion_tokens || 0, prediction: done };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.prompt || !a.out) { console.error("usage: node gen_video.mjs --prompt <p> --out <file.mp4> [--model --duration --res --ratio --seed]"); process.exit(1); }
  generateShot(a, loadKey()).catch(e => { console.error("FAILED:", e.message); process.exit(1); });
}
