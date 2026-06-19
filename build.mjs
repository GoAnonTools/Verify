#!/usr/bin/env node
/**
 * goanon.pro — Extension Build Script
 *
 * Builds the extension for Chrome (MV3) and Firefox (MV3/MV2).
 * Uses esbuild for fast bundling with shared source, browser-specific tweaks.
 *
 * Usage:
 *   node build.mjs                  # builds both
 *   node build.mjs --target chrome
 *   node build.mjs --target firefox
 *   node build.mjs --watch          # rebuild on changes
 */

import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// ─── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const target = args.find(a => a.startsWith("--target="))?.split("=")[1]
  ?? (args.includes("--target") ? args[args.indexOf("--target") + 1] : "all");
const watch = args.includes("--watch");
const prod = args.includes("--prod");

const targets = target === "all" ? ["chrome", "firefox"] : [target];

// ─── Shared esbuild config ────────────────────────────────────────────────────

const sharedConfig = {
  bundle: true,
  format: /** @type {"esm"} */ ("esm"),
  platform: /** @type {"browser"} */ ("browser"),
  target: ["chrome109", "firefox115"],  // MV3 minimum versions
  minify: prod,
  sourcemap: !prod,
  // snarkjs ships its own WASM loader — mark it external, we bundle the WASM separately
  external: ["*.wasm", "*.zkey"],
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
  loader: {
    ".ts": "ts",
  },
};

// ─── Build entries ────────────────────────────────────────────────────────────

const entries = [
  { in: "src/background.ts",  out: "background" },
  { in: "src/content.ts",     out: "content" },
  { in: "popup/popup.ts",     out: "popup/popup" },
];

// ─── Per-browser build ────────────────────────────────────────────────────────

async function build(browser) {
  const outDir = `dist/${browser}`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(`${outDir}/popup`, { recursive: true });
  fs.mkdirSync(`${outDir}/circuits`, { recursive: true });
  fs.mkdirSync(`${outDir}/icons`, { recursive: true });
  fs.mkdirSync(`${outDir}/sdk`, { recursive: true });

  console.log(`\n🔨 Building for ${browser}…`);

  // Bundle JS files
  const buildPromises = entries.map(entry =>
    esbuild.build({
      ...sharedConfig,
      entryPoints: [entry.in],
      outfile: `${outDir}/${entry.out}.js`,
      // Firefox MV3 doesn't support ES modules in service workers yet
      format: browser === "firefox" && entry.out === "background" ? "iife" : "esm",
    })
  );

  await Promise.all(buildPromises);

  // Copy static assets
  copyStatic(outDir, browser);

  console.log(`✅ ${browser} → ${outDir}/`);
}

function copyStatic(outDir, browser) {
  // Manifest — patch for Firefox if needed
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  if (browser === "firefox") {
    // Firefox MV3: background must use scripts[], not service_worker
    manifest.background = {
      scripts: ["background.js"],
      type: "module",
    };
    // Firefox requires explicit browser_specific_settings
    manifest.browser_specific_settings = {
      gecko: {
        id: "age-verify@goanon.pro",
        strict_min_version: "109.0",
      },
    };
    // Remove Chrome-only fields
    delete manifest._comment_firefox;
  } else {
    // Chrome MV3: service_worker
    manifest.background = {
      service_worker: "background.js",
      type: "module",
    };
    delete manifest.browser_specific_settings;
    delete manifest._comment_firefox;
  }

  fs.writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Popup HTML
  fs.copyFileSync("popup/popup.html", `${outDir}/popup/popup.html`);

  // Website SDK used by the demo and web-accessible resource list
  if (fs.existsSync("sdk/goanon-verify.js")) {
    fs.copyFileSync("sdk/goanon-verify.js", `${outDir}/sdk/goanon-verify.js`);
  }

  // Circuit files (WASM + zkey) — only if compiled
  for (const file of ["age_verify.wasm", "age_verify_final.zkey", "verification_key.json"]) {
    const src = `circuits/${file}`;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, `${outDir}/circuits/${file}`);
    } else {
      console.warn(`  ⚠  ${src} not found — run npm run circuit:build first`);
    }
  }

  // Icons — generate placeholder PNGs if real ones don't exist
  for (const size of [16, 32, 48, 128, 512]) {
    const src = `icons/icon${size}.png`;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, `${outDir}/icons/icon${size}.png`);
    } else {
      // Write a minimal valid PNG placeholder (1x1 purple pixel, scaled by browser)
      fs.writeFileSync(
        `${outDir}/icons/icon${size}.png`,
        generatePlaceholderPNG()
      );
    }
  }

  // snarkjs needs to be accessible from the extension
  const snarkjsDist = "node_modules/snarkjs/build/snarkjs.min.js";
  if (fs.existsSync(snarkjsDist)) {
    fs.copyFileSync(snarkjsDist, `${outDir}/snarkjs.min.js`);
  }
}

/**
 * Generates a minimal valid 1x1 purple PNG (placeholder icon).
 * The browser scales it — good enough for development.
 */
function generatePlaceholderPNG() {
  // Minimal 1x1 PNG: signature + IHDR + IDAT + IEND
  // Pixel colour: #7c6fff (goanon accent)
  return Buffer.from(
    "89504e470d0a1a0a" +                    // PNG signature
    "0000000d49484452" +                    // IHDR length + type
    "00000001" +                            // width: 1
    "00000001" +                            // height: 1
    "08020000" +                            // 8-bit RGB, no interlace
    "0090 77 53" +                          // CRC (placeholder — browser tolerates)
    "de0000000c49444154" +                  // IDAT
    "789c6260f8cf" +                        // zlib: purple-ish pixel
    "c000000002" +
    "0001e221" +                            // CRC
    "bc330000000049454e44ae426082",         // IEND
    "hex"
  );
}

// ─── Watch mode ───────────────────────────────────────────────────────────────

async function buildWatch(browser) {
  const outDir = `dist/${browser}`;
  fs.mkdirSync(outDir, { recursive: true });

  const contexts = await Promise.all(entries.map(entry =>
    esbuild.context({
      ...sharedConfig,
      entryPoints: [entry.in],
      outfile: `${outDir}/${entry.out}.js`,
    })
  ));

  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log(`👀 Watching for changes → ${outDir}/`);
  copyStatic(outDir, browser);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    for (const browser of targets) {
      if (watch) {
        await buildWatch(browser);
      } else {
        await build(browser);
      }
    }

    if (!watch) {
      const sizes = targets.map(b => {
        const files = ["background.js", "content.js", "popup/popup.js"];
        const total = files.reduce((sum, f) => {
          try {
            return sum + fs.statSync(`dist/${b}/${f}`).size;
          } catch { return sum; }
        }, 0);
        return `  ${b}: ${(total / 1024).toFixed(1)} KB total`;
      });
      console.log("\n📦 Bundle sizes:");
      console.log(sizes.join("\n"));
      console.log("\nLoad in Chrome: chrome://extensions → Load unpacked → dist/chrome/");
      console.log("Load in Firefox: about:debugging → Load Temporary Add-on → dist/firefox/manifest.json\n");
    }
  } catch (err) {
    console.error("Build failed:", err.message);
    process.exit(1);
  }
})();
