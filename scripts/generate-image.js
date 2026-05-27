#!/usr/bin/env node
/**
 * generate-image.js — Generate images via Replicate API and save to assets/images/
 *
 * Usage:
 *   node scripts/generate-image.js "prompt" [filename.webp] [--model schnell|pro|sdxl|imagen4]
 *
 * Examples:
 *   node scripts/generate-image.js "cute golden retriever on white background" "hero-dog.webp"
 *   node scripts/generate-image.js "prompt" "name.webp" --model imagen4
 *
 * API token is read from .env.local (REPLICATE_API_TOKEN).
 * Output saved to assets/images/<filename> and relative path printed to stdout.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found. Create it with REPLICATE_API_TOKEN=<your-key>");
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key) process.env[key] = val;
  }
}

// ── Model configs ────────────────────────────────────────────────────────────
const MODELS = {
  schnell: {
    // Fast (4-step), great for iteration and drafts
    endpoint: "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
    buildInput: (prompt) => ({ prompt, num_outputs: 1, output_format: "webp", output_quality: 90 }),
  },
  pro: {
    // Higher quality, slower — use for hero/key images
    endpoint: "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
    buildInput: (prompt) => ({ prompt, output_format: "webp", output_quality: 90 }),
  },
  sdxl: {
    // Good for product/lifestyle shots
    endpoint: "https://api.replicate.com/v1/models/stability-ai/sdxl/predictions",
    buildInput: (prompt) => ({ prompt, width: 1024, height: 1024, num_outputs: 1 }),
  },
  imagen4: {
    // Google Imagen 4 — highest quality, photorealistic, free tier available
    endpoint: "https://api.replicate.com/v1/models/google/imagen-4/predictions",
    buildInput: (prompt) => ({
      prompt,
      aspect_ratio: "4:3",
      safety_filter_level: "block_medium_and_above",
    }),
  },
};

// ── API helpers ──────────────────────────────────────────────────────────────
async function createPrediction(endpoint, input, token) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60", // ask Replicate to wait up to 60s (avoids manual polling for fast models)
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Replicate API error ${res.status}: ${errText}`);
  }

  return res.json();
}

async function pollUntilDone(predictionUrl, token, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Poll request failed: ${res.status}`);
    const data = await res.json();

    if (data.status === "succeeded") return data;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Prediction ${data.status}: ${data.error ?? "unknown error"}`);
    }

    process.stderr.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for image generation (120s)");
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();

  const args = process.argv.slice(2);

  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    process.stderr.write(
      'Usage: node scripts/generate-image.js "prompt" [filename.webp] [--model schnell|pro|sdxl]\n'
    );
    process.exit(0);
  }

  // Parse --model flag
  const modelFlagIdx = args.indexOf("--model");
  const modelName = modelFlagIdx !== -1 ? args[modelFlagIdx + 1] : "schnell";
  const cleanArgs =
    modelFlagIdx === -1
      ? args
      : args.filter((_, i) => i !== modelFlagIdx && i !== modelFlagIdx + 1);

  const prompt = cleanArgs[0];
  const filename = cleanArgs[1] ?? `generated-${Date.now()}.webp`;

  if (!prompt) {
    throw new Error('No prompt provided. Usage: node scripts/generate-image.js "your prompt"');
  }

  const model = MODELS[modelName];
  if (!model) {
    throw new Error(`Unknown model "${modelName}". Choose: ${Object.keys(MODELS).join(", ")}`);
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set in .env.local");

  const outputDir = path.join(ROOT, "assets", "images");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const destPath = path.join(outputDir, filename);

  const modelLabel = { schnell: "flux-schnell", pro: "flux-1.1-pro", sdxl: "sdxl", imagen4: "google/imagen-4" }[modelName] ?? modelName;
  process.stderr.write(`\n🎨 Generating: "${prompt}"\n`);
  process.stderr.write(`   Model: ${modelLabel}  |  Output: assets/images/${filename}\n`);
  process.stderr.write("   Progress: ");

  let prediction = await createPrediction(model.endpoint, model.buildInput(prompt), token);

  // If "Prefer: wait" didn't resolve it, poll manually
  if (prediction.status !== "succeeded") {
    prediction = await pollUntilDone(prediction.urls?.get ?? prediction.url, token);
  }

  process.stderr.write(" ✓\n");

  // Output can be array or string depending on model
  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (!outputUrl) throw new Error("No output URL returned from Replicate");

  await downloadImage(outputUrl, destPath);

  const relativePath = `assets/images/${filename}`;
  console.log(relativePath); // stdout: the insertable path
  process.stderr.write(`\n✅ Saved → ${relativePath}\n\n`);
}

main().catch((err) => {
  process.stderr.write(`\n❌ Error: ${err.message}\n`);
  process.exit(1);
});
