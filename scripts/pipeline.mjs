// Full pipeline, two modes sharing one entrypoint:
//
// STORYBOARD MODE (pitch.json has `keyframes[]` + shots with from/to):
//   Phase A: chain-generate keyframe stills (K0 text-to-image; each next via
//            edit with the previous frame as reference) → storyboard.html
//            → STOP for human review (unless --go).
//   Phase B (rerun, or --go): keyframe-conditioned image-to-video per shot
//            (first=K[from], last=K[to]) in parallel → overlays → hard-cut stitch.
//
// CLASSIC MODE (shots have `video_prompt`, no keyframes): text-to-video in
//   parallel → overlays → xfade stitch. (v1 behavior, still supported.)
//
// CLI: node pipeline.mjs pitch.json --out <buildDir> [--dry] [--go]
//      [--storyboard-only] [--skip-music]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadKey, RATE, parseArgs, withRetry } from "./atlas.mjs";
import { generateShot } from "./gen_video.mjs";
import { generateMusic } from "./gen_music.mjs";
import { generateKeyframe, generateKeyframeSet } from "./gen_image.mjs";
import { renderAll, findBrowser } from "./overlay.mjs";
import { stitch, findFfmpeg } from "./stitch.mjs";

const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function writeStoryboard(pitch, build) {
  const kf = pitch.keyframes.map(k => `
    <div class="k"><img src="keyframes/${k.id}.png"><div class="meta"><b>${esc(k.id)}</b><p>${esc(k.prompt)}</p></div></div>`).join("");
  const sh = pitch.shots.map(s => `
    <div class="s"><b>${esc(s.id)}</b> <span class="arrow">${esc(s.from)} → ${esc(s.to)}</span> · ${s.duration}s
      <p class="m">${esc(s.motion_prompt || s.video_prompt || "")}</p>
      ${s.overlay ? `<p class="o">叠字: ${esc(s.overlay.text || s.overlay.title || s.overlay.value || "")}</p>` : ""}</div>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(pitch.product)} — storyboard</title><style>
    body{background:#000;color:#f5f5f7;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:40px;max-width:1280px;margin:auto}
    h1{font-weight:700;letter-spacing:-.02em} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin:28px 0}
    .k img{width:100%;border-radius:12px;display:block} .k .meta{padding:10px 4px;color:#86868b;font-size:13px} .k b{color:#f5f5f7}
    .s{border-top:1px solid #222;padding:14px 4px;font-size:14px} .arrow{color:${pitch.accent || "#2997ff"}}
    .m{color:#86868b;margin:.4em 0 0} .o{color:${pitch.accent || "#2997ff"};margin:.3em 0 0}
  </style></head><body>
  <h1>${esc(pitch.product)} — Storyboard</h1>
  <p style="color:#86868b">审查关键帧:构图、材质、连续性。重摇某帧 → 删除 keyframes/&lt;id&gt;.png(如需也改 prompt)后重跑;全部满意 → 重跑管线(或加 --go)进入视频生成。</p>
  <div class="grid">${kf}</div><h2>Shots</h2>${sh}</body></html>`;
  const out = join(build, "storyboard.html");
  writeFileSync(out, html);
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const pitchFile = a._[0];
  if (!pitchFile || !a.out) { console.error("usage: node pipeline.mjs pitch.json --out <buildDir> [--dry] [--go] [--storyboard-only] [--skip-music]"); process.exit(1); }
  const pitch = JSON.parse(readFileSync(pitchFile, "utf8"));
  const build = a.out;
  mkdirSync(join(build, "shots"), { recursive: true });

  const key = loadKey();
  const ffmpeg = findFfmpeg();
  findBrowser();

  const storyboard = Array.isArray(pitch.keyframes) && pitch.keyframes.length > 0;
  const vModel = pitch.model || (storyboard ? "bytedance/seedance-2.0/image-to-video" : "bytedance/seedance-2.0/text-to-video");
  const iModel = pitch.image_model || "bytedance/seedream-v5.0-pro";

  // ---------- cost plan ----------
  const kfTodo = storyboard ? pitch.keyframes.filter(k => !existsSync(join(build, "keyframes", `${k.id}.png`))) : [];
  const shotsTodo = pitch.shots.filter(s => !existsSync(join(build, "shots", `${s.id}.mp4`)));
  const vidSecs = shotsTodo.reduce((s, x) => s + x.duration, 0);
  const needMusic = pitch.music && !a["skip-music"] && !existsSync(join(build, "music.mp3"));
  const kfCost = kfTodo.length * (RATE[iModel + "/text-to-image"] ?? RATE[iModel] ?? 0.045);
  const est = kfCost + vidSecs * (RATE[vModel] ?? 0.09) + (needMusic ? (RATE[pitch.music?.model] ?? 0.15) : 0);
  console.log(`plan: ${storyboard ? `${kfTodo.length}/${pitch.keyframes.length} keyframes + ` : ""}${shotsTodo.length}/${pitch.shots.length} shots (${vidSecs}s) + music:${needMusic} → est. ~$${est.toFixed(2)}`);
  if (a.dry) { console.log("(dry run — nothing generated)"); return; }

  let tokens = 0;

  // ---------- Phase A: keyframes ----------
  // All missing → ONE sequential-model batch call (fast, consistent by
  // construction). Some missing (re-rolls) → per-frame edit with the previous
  // frame as reference, style anchor appended so re-rolls don't drift.
  if (storyboard) {
    mkdirSync(join(build, "keyframes"), { recursive: true });
    const newlyGenerated = kfTodo.length > 0;
    const anchor = pitch.keyframe_style || "";
    // batch (one sequential-model call) only when the image model supports
    // it; otherwise chain frame-by-frame (K0 text-to-image, later frames edit
    // with the previous frame as reference — e.g. gpt-image-2 has no
    // sequential variant).
    if (kfTodo.length === pitch.keyframes.length && iModel.includes("/sequential")) {
      const r = await withRetry(() => generateKeyframeSet({
        keyframes: pitch.keyframes, styleAnchor: anchor,
        outDir: join(build, "keyframes"), model: iModel,
      }, key), { label: "keyframes" });
      tokens += r.tokens;
    } else {
      for (let i = 0; i < pitch.keyframes.length; i++) {
        const k = pitch.keyframes[i];
        const out = join(build, "keyframes", `${k.id}.png`);
        if (existsSync(out)) { console.log(`[${k.id}] exists — skip`); continue; }
        const refs = [];
        if (i > 0) refs.push(join(build, "keyframes", `${pitch.keyframes[i - 1].id}.png`));
        const chainModel = pitch.edit_model || iModel.replace(/\/(sequential|edit-sequential)$/, "");
        const r = await withRetry(() => generateKeyframe({
          prompt: `${k.prompt} ${anchor}`, out, ref: refs, model: chainModel, label: k.id,
        }, key), { label: k.id });
        tokens += r.tokens;
      }
    }
    const sb = writeStoryboard(pitch, build);
    console.log(`storyboard → ${resolve(sb)}`);
    if (a["storyboard-only"] || (newlyGenerated && !a.go)) {
      console.log(`\nSTORYBOARD READY — review it, re-roll any keyframe by deleting its png (and tweaking its prompt), then rerun this command to generate videos (est. video cost ~$${(pitch.shots.reduce((s, x) => s + x.duration, 0) * (RATE[vModel] ?? 0.09)).toFixed(2)}).`);
      return;
    }
  }

  // ---------- Phase B: videos + music (parallel) ----------
  const jobs = [];
  let stagger = 0;
  for (const shot of pitch.shots) {
    const out = join(build, "shots", `${shot.id}.mp4`);
    if (existsSync(out)) { console.log(`[${shot.id}] exists — skip`); continue; }
    const opts = {
      prompt: shot.motion_prompt || shot.video_prompt, out, label: shot.id, model: vModel,
      duration: shot.duration, res: pitch.resolution || "1080p", ratio: pitch.ratio || "16:9",
      seed: shot.seed ?? -1, audio: false,
    };
    if (storyboard) {
      if (!shot.from || !shot.to) throw new Error(`${shot.id}: storyboard mode requires from/to keyframe ids`);
      opts.firstFrame = join(build, "keyframes", `${shot.from}.png`);
      opts.lastFrame = join(build, "keyframes", `${shot.to}.png`);
      if (!existsSync(opts.firstFrame) || !existsSync(opts.lastFrame)) throw new Error(`${shot.id}: missing keyframe png(s)`);
    }
    const delay = stagger; stagger += 1500;
    jobs.push(new Promise(r => setTimeout(r, delay)).then(() => withRetry(() => generateShot(opts, key), { label: shot.id })));
  }
  if (needMusic) {
    jobs.push(withRetry(() => generateMusic({ prompt: pitch.music.prompt, out: join(build, "music.mp3"), model: pitch.music.model }, key), { label: "music" }));
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(r => r.status === "rejected");
  tokens += results.filter(r => r.status === "fulfilled").reduce((s, r) => s + (r.value?.tokens || 0), 0);
  if (failed.length) {
    failed.forEach(f => console.error("FAILED:", f.reason?.message || f.reason));
    console.error(`${failed.length} generation(s) failed — fix/rerun; completed work is cached in ${build}`);
    process.exit(1);
  }

  renderAll(pitch, join(build, "overlays"));
  const fin = stitch(pitch, build, { ffmpeg });

  console.log(`\nDONE → ${fin.file}`);
  console.log(`duration ${fin.duration.toFixed(1)}s | size ${(fin.size / 1e6).toFixed(1)} MB | billed tokens this run: ${tokens}`);
}

main().catch(e => { console.error("PIPELINE FAILED:", e.message); process.exit(1); });
