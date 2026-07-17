// Screenshot a live webpage with the same headless browser used for overlays.
// Gives the model the page's rendered look — visual temperament that text
// scraping can't carry (art direction, density, dark/light feel, tone).
// CLI: node snap_page.mjs <url> --out page.png [--w 1440] [--h 2400] [--wait 9000]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { findBrowser } from "./overlay.mjs";
import { parseArgs } from "./atlas.mjs";

export function snapPage({ url, out, w = 1440, h = 2400, wait = 9000 }) {
  const browser = findBrowser();
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const r = spawnSync(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${w},${h}`, `--virtual-time-budget=${wait}`,
    "--no-first-run", "--no-default-browser-check",
    `--screenshot=${resolve(out)}`, url,
  ], { timeout: 90000, encoding: "utf8" });
  if (!existsSync(out)) throw new Error(`no screenshot produced (${r.status}): ${(r.stderr || "").slice(-300)}`);
  console.log(`[snap] ${url} → ${out} (${w}x${h})`);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  const url = a._[0];
  if (!url || !a.out) { console.error("usage: node snap_page.mjs <url> --out page.png [--w 1440 --h 2400 --wait 9000]"); process.exit(1); }
  snapPage({ url, out: a.out, w: Number(a.w || 1440), h: Number(a.h || 2400), wait: Number(a.wait || 9000) });
}
