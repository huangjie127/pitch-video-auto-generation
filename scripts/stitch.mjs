// Stitch shots into the final film: normalize + overlay text (alpha fades)
// → xfade chain → soundtrack (trim + fade) → final.mp4
// CLI: node stitch.mjs pitch.json --build <dir>
// Expects: <dir>/shots/<id>.mp4, <dir>/overlays/<id>.png (optional), <dir>/music.mp3 (optional)
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { parseArgs } from "./atlas.mjs";

export function findFfmpeg(cwd = process.cwd()) {
  const cands = [
    process.env.FFMPEG_PATH,
    join(cwd, "tools/ffmpeg/bin/ffmpeg.exe"),
    join(cwd, "../tools/ffmpeg/bin/ffmpeg.exe"),
    "ffmpeg",
  ].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  throw new Error("ffmpeg not found — install it, set FFMPEG_PATH, or place a build at tools/ffmpeg/");
}

function run(bin, args, label) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${label} failed:\n${(r.stderr || "").split("\n").slice(-14).join("\n")}`);
  return r;
}

export function stitch(pitch, buildDir, { ffmpeg } = {}) {
  ffmpeg = ffmpeg || findFfmpeg();
  const fps = pitch.fps || 30;
  const [rw, rh] = (pitch.ratio === "9:16") ? [1080, 1920] : [1920, 1080];
  const cf = pitch.crossfade ?? 0.5;
  const work = join(buildDir, "work");
  mkdirSync(work, { recursive: true });

  // 1) normalize each shot + burn its overlay with alpha fades
  const normed = [];
  for (const shot of pitch.shots) {
    const src = join(buildDir, "shots", `${shot.id}.mp4`);
    if (!existsSync(src)) throw new Error(`missing shot: ${src}`);
    const dst = join(work, `${shot.id}.mp4`);
    normed.push({ dst, dur: shot.duration });
    if (existsSync(dst)) { console.log(`[stitch] ${shot.id} normalized — skip`); continue; }
    const png = join(buildDir, "overlays", `${shot.id}.png`);
    const hasOv = shot.overlay && existsSync(png);
    const base = `[0:v]scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh},fps=${fps},setsar=1[v0]`;
    let args;
    if (hasOv) {
      const tin = shot.overlay.in ?? 1.0, tout = shot.overlay.out ?? (shot.duration - 0.6);
      const fc = `${base};[1:v]format=rgba,fade=t=in:st=${tin}:d=0.5:alpha=1,fade=t=out:st=${tout}:d=0.5:alpha=1[ov];[v0][ov]overlay=0:0:format=auto[v]`;
      args = ["-y", "-i", src, "-loop", "1", "-t", String(shot.duration), "-i", png,
        "-filter_complex", fc, "-map", "[v]", "-an",
        "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-t", String(shot.duration), dst];
    } else {
      args = ["-y", "-i", src, "-filter_complex", base.replace("[v0]", "[v]"), "-map", "[v]", "-an",
        "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-t", String(shot.duration), dst];
    }
    run(ffmpeg, args, `normalize ${shot.id}`);
    console.log(`[stitch] normalized ${shot.id}`);
  }

  // 2) join shots — hard cut (storyboard mode: adjacent shots share their
  //    boundary keyframe, so a cut is seamless; drop the duplicated first
  //    frame of each subsequent clip) or xfade chain (classic mode)
  const n = normed.length;
  const hard = (pitch.cut || (pitch.keyframes ? "hard" : "fade")) === "hard";
  const inputs = normed.flatMap(x => ["-i", x.dst]);
  let fc = "", videoDur;
  if (hard && n > 1) {
    videoDur = normed.reduce((s, x) => s + x.dur, 0) - (n - 1) / fps;
    const parts = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) { parts.push(`[0:v]`); continue; }
      fc += `[${i}:v]trim=start_frame=1,setpts=PTS-STARTPTS[c${i}];`;
      parts.push(`[c${i}]`);
    }
    fc += `${parts.join("")}concat=n=${n}:v=1:a=0[vx];`;
  } else if (n > 1) {
    videoDur = normed.reduce((s, x) => s + x.dur, 0) - cf * (n - 1);
    let prev = "[0:v]", off = 0;
    for (let i = 1; i < n; i++) {
      off += normed[i - 1].dur - cf;
      const out = i === n - 1 ? "[vx]" : `[x${i}]`;
      fc += `${prev}[${i}:v]xfade=transition=fade:duration=${cf}:offset=${off.toFixed(3)}${out};`;
      prev = out;
    }
  } else {
    videoDur = normed[0].dur;
  }
  // final fade to black over last 0.8s
  fc += `${n === 1 ? "[0:v]" : "[vx]"}fade=t=out:st=${(videoDur - 0.8).toFixed(2)}:d=0.8[vfinal]`;

  // 3) soundtrack
  const music = join(buildDir, "music.mp3");
  const hasMusic = existsSync(music);
  const finalOut = join(buildDir, "final.mp4");
  let args = ["-y", ...inputs];
  if (hasMusic) {
    args.push("-i", music);
    fc += `;[${n}:a]atrim=0:${videoDur.toFixed(2)},afade=t=in:st=0:d=1,afade=t=out:st=${(videoDur - 2).toFixed(2)}:d=2,aformat=sample_rates=44100:channel_layouts=stereo[afinal]`;
    args.push("-filter_complex", fc, "-map", "[vfinal]", "-map", "[afinal]", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-filter_complex", fc, "-map", "[vfinal]");
  }
  args.push("-c:v", "libx264", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", finalOut);
  run(ffmpeg, args, "stitch final");

  const probe = spawnSync(ffmpeg.replace(/ffmpeg(\.exe)?$/, "ffprobe$1"), ["-v", "quiet", "-show_entries", "format=duration,size", "-of", "json", finalOut], { encoding: "utf8" });
  let meta = {};
  try { meta = JSON.parse(probe.stdout).format; } catch {}
  console.log(`[stitch] final → ${resolve(finalOut)} (${Number(meta.duration || 0).toFixed(1)}s, ${(Number(meta.size || 0) / 1e6).toFixed(1)} MB)`);
  return { file: finalOut, duration: Number(meta.duration || videoDur), size: Number(meta.size || 0) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  const pitchFile = a._[0];
  if (!pitchFile || !a.build) { console.error("usage: node stitch.mjs pitch.json --build <dir>"); process.exit(1); }
  stitch(JSON.parse(readFileSync(pitchFile, "utf8")), a.build);
}
