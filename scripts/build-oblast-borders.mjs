// Precomputes one outer border path per Ukrainian oblast by unioning that
// oblast's raion polygons, and writes the result to a JSON file the app
// imports at runtime. This runs once at build time (via the "prebuild" npm
// script) instead of in every visitor's browser — polygon-clipping's union
// over ~139 shapes is a genuinely heavy synchronous computation, and the
// source district data never changes at runtime, so recomputing it per
// page load was pure wasted main-thread time (and blocking the initial
// render besides).
import polygonClipping from "polygon-clipping";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DISTRICTS_SVG, extractRingsByOblast, multiPolygonToPathD } from "../src/data/districtBorders.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "data", "oblastBorderPaths.json");

const ringsByOblast = extractRingsByOblast(DISTRICTS_SVG);

const result = {};
for (const [oblast, rings] of Object.entries(ringsByOblast)) {
  const polygons = rings.map(r => [r]);
  let unioned;
  try {
    unioned = polygonClipping.union(...polygons);
  } catch (e) {
    console.warn(`polygon-clipping union failed for "${oblast}", falling back to un-merged raion outlines:`, e.message);
    unioned = polygons;
  }
  result[oblast] = multiPolygonToPathD(unioned);
}

writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(`Wrote ${Object.keys(result).length} oblast border paths to ${outPath}`);
