import { spawnSync } from "node:child_process";
import { conditions } from "../src/conditions.ts";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const conditionSource = join(root, "images_src");
// Keep the scene size in sync with imageDimensions in src/helpers.ts.
const output = { directory: join(root, "public", "images"), size: 128 };
const uiIcons = ["close", "error", "left", "right"];

function normalizedName(file) {
  return file
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[_'-]/g, "")
    .replace(/[ ]/g, "_");
}

function outputPath(file, category) {
  return join(output.directory, category, `${normalizedName(file)}.webp`);
}

function clearGeneratedConditions() {
  const directory = join(output.directory, "conditions");
  mkdirSync(directory, { recursive: true });
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.webp$/i.test(entry.name)) {
      unlinkSync(join(directory, entry.name));
    }
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(webp|png|jpg|jpeg)$/i.test(entry.name))
    .map(entry => entry.name)
    .sort();
}

function validateConditionFiles(files) {
  const conditionCounts = new Map();
  for (const condition of conditions) {
    const name = normalizedName(condition);
    conditionCounts.set(name, (conditionCounts.get(name) ?? 0) + 1);
  }

  const fileCounts = new Map();
  for (const file of files) {
    const name = normalizedName(file);
    fileCounts.set(name, (fileCounts.get(name) ?? 0) + 1);
  }

  const missingFiles = [...conditionCounts.keys()].filter(name => !fileCounts.has(name));
  const extraFiles = [...fileCounts.keys()].filter(name => !conditionCounts.has(name));
  const duplicateConditions = [...conditionCounts].filter(([, count]) => count > 1).map(([name]) => name);
  const duplicateFiles = [...fileCounts].filter(([, count]) => count > 1).map(([name]) => name);

  if (missingFiles.length || extraFiles.length || duplicateConditions.length || duplicateFiles.length) {
    const details = [];
    if (missingFiles.length) details.push(`Missing image files for conditions: ${missingFiles.join(", ")}`);
    if (extraFiles.length) details.push(`Image files without conditions: ${extraFiles.join(", ")}`);
    if (duplicateConditions.length) details.push(`Duplicate conditions: ${duplicateConditions.join(", ")}`);
    if (duplicateFiles.length) details.push(`Duplicate normalized image filenames: ${duplicateFiles.join(", ")}`);
    throw new Error(`Condition images must match src/conditions.ts one-to-one.\n${details.join("\n")}`);
  }
}

function clearLegacyFlatImages() {
  for (const entry of readdirSync(output.directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.webp$/i.test(entry.name)) {
      unlinkSync(join(output.directory, entry.name));
    }
  }
}

function magick(args) {
  const result = spawnSync("magick", args, { encoding: "utf8", windowsHide: true });
  if (result.error) {
    throw new Error(`Cannot run ImageMagick. Install ImageMagick 7 and add magick to PATH. ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ImageMagick failed: ${result.stderr || result.signal || result.status}`);
  }
}

function buildImages() {
  const conditionFiles = sourceFiles(conditionSource);
  if (conditionFiles.length === 0) throw new Error("No condition originals found in images_src.");
  validateConditionFiles(conditionFiles);

  // Render deploys the generated assets committed alongside the originals.
  // Do not require a system ImageMagick installation on the build server.
  if (process.env.RENDER === "true") {
    const missing = [];
    const generatedFiles = [
      ...conditionFiles.map(file => outputPath(file, "conditions")),
      ...uiIcons.map(icon => outputPath(`${icon}.webp`, "ui")),
    ];
    for (const path of generatedFiles) {
      try {
        const stats = statSync(path);
        if (!stats.isFile() || stats.size === 0) missing.push(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        missing.push(path);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Generated images missing or empty. Run npm run images locally and commit images_src, public/images/conditions, and public/images/ui before deploying:\n${missing.join("\n")}`);
    }
    console.log(`Render: using ${conditionFiles.length} condition images and ${uiIcons.length} UI icons; skipping ImageMagick.`);
    return;
  }

  magick(["-version"]);

  clearGeneratedConditions();
  mkdirSync(join(output.directory, "conditions"), { recursive: true });
  for (const file of conditionFiles) {
    // Always resample the original, never a previously generated image.
    // Fit non-square sources without cropping, with transparent padding.
    magick([
      join(conditionSource, file),
      "-filter", "Lanczos",
      "-resize", `${output.size}x${output.size}`,
      "-background", "none",
      "-gravity", "center",
      "-extent", `${output.size}x${output.size}`,
      "-define", "webp:lossless=true",
      outputPath(file, "conditions"),
    ]);
  }
  clearLegacyFlatImages();
  console.log(`Generated ${conditionFiles.length} condition WebPs at ${output.size}x${output.size}; UI icons left unchanged.`);
}

try {
  buildImages();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
