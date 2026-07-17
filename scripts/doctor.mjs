// Environment self-check: verifies every external dependency the pipeline
// needs. Run this first after cloning.
// CLI: node scripts/doctor.mjs
import { loadKey } from "./atlas.mjs";
import { findBrowser } from "./overlay.mjs";
import { findFfmpeg } from "./stitch.mjs";

let ok = true;
const check = (name, fn) => {
  try { const v = fn(); console.log(`✓ ${name}${v ? " — " + v : ""}`); }
  catch (e) { ok = false; console.log(`✗ ${name} — ${e.message}`); }
};

check("Node 18+ (global fetch)", () => {
  if (typeof fetch !== "function") throw new Error("fetch missing — upgrade Node to 18+");
  return process.version;
});
check("ffmpeg", () => findFfmpeg());
check("Chrome/Edge (headless overlays & page snaps)", () => findBrowser());
check("ATLAS_CLOUD_API_KEY", () => { const k = loadKey(); return k.slice(0, 10) + "…"; });

if (ok) {
  console.log("\nAll set. Ask Claude for a pitch video, or run the pipeline manually:");
  console.log("  node scripts/pipeline.mjs pitch.json --out build");
} else {
  console.log("\nFix the ✗ items above. See README → Requirements.");
  process.exit(1);
}
