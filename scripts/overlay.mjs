// Render typography overlay PNGs (transparent) from pitch.json via headless Chrome/Edge.
// CLI: node overlay.mjs pitch.json --out <dir> [--w 1920 --h 1080]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseArgs } from "./atlas.mjs";

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export function findBrowser() {
  const cands = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error("No Chrome/Edge found — set CHROME_PATH");
}

const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const emph = s => esc(s).replace(/\{\{(.+?)\}\}/g, '<span class="em">$1</span>');

export function overlayContent(ov) {
  switch (ov.type) {
    case "statement": return `<h2 class="statement">${emph(ov.text)}</h2>`;
    case "hero": return `${ov.kicker ? `<p class="kicker">${emph(ov.kicker)}</p>` : ""}
      <h1 class="hero-title">${emph(ov.title)}</h1>
      ${ov.subtitle ? `<p class="hero-sub">${emph(ov.subtitle)}</p>` : ""}`;
    case "number": return `<div class="num">${esc(ov.value)}${ov.unit ? `<span class="unit">${esc(ov.unit)}</span>` : ""}</div>
      ${ov.label ? `<p class="num-label">${emph(ov.label)}</p>` : ""}`;
    case "closing": return `<h2 class="closing-title">${emph(ov.title)}</h2>
      ${ov.tagline ? `<p class="tagline">${emph(ov.tagline)}</p>` : ""}
      ${ov.cta ? `<p class="cta">${emph(ov.cta)}</p>` : ""}`;
    default: return `<h2 class="statement">${emph(ov.text || "")}</h2>`;
  }
}

// vertical placement of the text block within the frame — match it to the
// footage composition so text never sits on the shot's brightest area
const POS = {
  center: { v: "center", pt: "6vh", pb: "6vh" },
  lower: { v: "flex-end", pt: "6vh", pb: "11vh" },
  upper: { v: "flex-start", pt: "11vh", pb: "6vh" },
};
// dark theme = white type for dark footage (default); light theme = ink type
// for light/bright films — white-on-light is invisible
const THEMES = {
  dark: { fg: "#f5f5f7", muted: "rgba(245,245,247,.78)", shadow: "0 2px 18px rgba(0,0,0,.55), 0 0 60px rgba(0,0,0,.35)" },
  light: { fg: "#1d1d1f", muted: "rgba(29,29,31,.66)", shadow: "0 1px 14px rgba(255,255,255,.6), 0 0 40px rgba(255,255,255,.4)" },
};

export function renderOverlayPng({ overlay, accent, theme, outPng, w = 1920, h = 1080, browser }) {
  browser = browser || findBrowser();
  const pos = POS[overlay.pos] || POS.center;
  const th = THEMES[overlay.theme || theme] || THEMES.dark;
  const tpl = readFileSync(join(SKILL_DIR, "assets", "overlay.html"), "utf8");
  const html = tpl.replaceAll("__ACCENT__", accent || "#2997ff").replace("__CONTENT__", overlayContent(overlay))
    .replace("__VALIGN__", pos.v).replace("__PADTOP__", pos.pt).replace("__PADBOT__", pos.pb)
    .replace("__FG__", th.fg).replace("__MUTED__", th.muted).replace("__SHADOW__", th.shadow);
  const tmpHtml = resolve(dirname(outPng), `.ov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.html`);
  mkdirSync(dirname(outPng), { recursive: true });
  writeFileSync(tmpHtml, html);
  try {
    const r = spawnSync(browser, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--window-size=${w},${h}`, "--default-background-color=00000000",
      "--virtual-time-budget=2500", "--no-first-run", "--no-default-browser-check",
      `--screenshot=${resolve(outPng)}`, pathToFileURL(tmpHtml).href,
    ], { timeout: 60000, encoding: "utf8" });
    if (!existsSync(outPng)) throw new Error(`browser produced no PNG (${r.status}): ${(r.stderr || "").slice(-400)}`);
  } finally { rmSync(tmpHtml, { force: true }); }
  return outPng;
}

export function renderAll(pitch, outDir, { w = 1920, h = 1080 } = {}) {
  const browser = findBrowser();
  const done = [];
  for (const shot of pitch.shots) {
    if (!shot.overlay) continue;
    const outPng = join(outDir, `${shot.id}.png`);
    if (existsSync(outPng)) { console.log(`[overlay] ${shot.id}.png exists — skip`); done.push(outPng); continue; }
    renderOverlayPng({ overlay: shot.overlay, accent: pitch.accent, theme: pitch.overlay_theme, outPng, w, h, browser });
    console.log(`[overlay] rendered ${shot.id}.png`);
    done.push(outPng);
  }
  return done;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  const pitchFile = a._[0];
  if (!pitchFile || !a.out) { console.error("usage: node overlay.mjs pitch.json --out <dir> [--w 1920 --h 1080]"); process.exit(1); }
  const pitch = JSON.parse(readFileSync(pitchFile, "utf8"));
  renderAll(pitch, a.out, { w: Number(a.w || 1920), h: Number(a.h || 1080) });
}
