// Generate an instrumental soundtrack: submit → poll → download.
// CLI: node gen_music.mjs --prompt "minimal ambient electronic..." --out music.mp3
//      [--model minimax/music-2.6 | suno/chirp-v5]
import { loadKey, submitAudio, poll, download, parseArgs } from "./atlas.mjs";

export async function generateMusic(opts, key) {
  const model = opts.model || "minimax/music-2.6";
  const input = model.startsWith("suno/")
    ? { model, prompt: opts.prompt, make_instrumental: true }
    : { model, prompt: opts.prompt, is_instrumental: true, format: "mp3", sample_rate: 44100, bitrate: 256000 };
  const sub = await submitAudio(input, key);
  if (!sub.id) throw new Error("submit returned no id: " + JSON.stringify(sub).slice(0, 300));
  console.log(`[music] submitted (${model})`);
  const done = await poll(sub.id, key, {
    label: "music",
    onTick: (s, t) => { if (t % 28 < 7) console.log(`[music] ${s} … ${t}s`); },
  });
  const url = done.outputs?.[0];
  if (!url) throw new Error("completed but no outputs: " + JSON.stringify(done).slice(0, 300));
  await download(url, opts.out);
  console.log(`[music] saved → ${opts.out} (tokens: ${done.completion_tokens ?? "?"})`);
  return { file: opts.out, tokens: done.completion_tokens || 0 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.prompt || !a.out) { console.error("usage: node gen_music.mjs --prompt <p> --out <file.mp3> [--model]"); process.exit(1); }
  generateMusic(a, loadKey()).catch(e => { console.error("FAILED:", e.message); process.exit(1); });
}
