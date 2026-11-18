import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

function fixture(t, { missing = false, empty = false, generate = false } = {}) {
  const base = resolve(tmpdir());
  const root = mkdtempSync(join(base, "conditionmarkers-images-"));
  t.after(() => {
    assert.ok(root.startsWith(`${base}${sep}conditionmarkers-images-`));
    rmSync(root, { recursive: true, force: true });
  });
  for (const directory of [
    "scripts",
    "images_src",
    "public/images",
    "public/images/conditions",
    "public/images/ui",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  copyFileSync(new URL("../scripts/build-images.mjs", import.meta.url), join(root, "scripts/build-images.mjs"));
  if (generate) {
    for (const [directory, file] of [
      ["images_src", "Prone.png"],
      ["images_src", "Shield of Faith.png"],
    ]) {
      const image = spawnSync("magick", ["-size", "1x1", "xc:red", join(root, directory, file)], {
        encoding: "utf8",
        windowsHide: true,
      });
      assert.equal(image.status, 0, image.stderr);
    }
  } else {
    writeFileSync(join(root, "images_src/Prone.png"), "original");
    writeFileSync(join(root, "images_src/Shield of Faith.png"), "original");
  }
  for (const icon of ["close", "error", "left", "right"]) {
    writeFileSync(join(root, `public/images/ui/${icon}.webp`), `final ${icon}`);
  }
  writeFileSync(join(root, "public/images/conditions/stale.webp"), "stale");
  writeFileSync(join(root, "public/images/conditions/shield_of_faith.webp"), "generated");
  writeFileSync(join(root, "public/images/stale.webp"), "legacy");
  if (!missing) writeFileSync(join(root, "public/images/conditions/prone.webp"), empty ? "" : "generated");
  // An empty PATH proves this path never invokes ImageMagick.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"));
  const result = spawnSync(process.execPath, [join(root, "scripts/build-images.mjs")], {
    encoding: "utf8",
    env: generate ? process.env : { ...env, PATH: "", RENDER: "true" },
    timeout: 10000,
    windowsHide: true,
  });
  return { result, root };
}

test("Render uses generated images without ImageMagick", t => {
  const { result } = fixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 condition images and 4 UI icons; skipping ImageMagick/);
});

test("Render reports a missing generated image", t => {
  const { result } = fixture(t, { missing: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Run npm run images locally/);
  assert.match(result.stderr, /public[\\/]images[\\/]conditions[\\/]prone\.webp/);
});

test("Render rejects an empty generated image", t => {
  const { result } = fixture(t, { empty: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Generated images missing or empty/);
});

test("Generation purges stale condition and flat images but keeps UI folder separate", t => {
  const version = spawnSync("magick", ["-version"], { encoding: "utf8", windowsHide: true });
  if (version.error) {
    t.skip("ImageMagick is unavailable");
    return;
  }

  const { result, root } = fixture(t, { generate: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, "public/images/conditions/stale.webp")), false);
  assert.equal(existsSync(join(root, "public/images/stale.webp")), false);
  assert.equal(existsSync(join(root, "public/images/conditions/prone.webp")), true);
  assert.equal(existsSync(join(root, "public/images/ui/left.webp")), true);
  assert.equal(readFileSync(join(root, "public/images/ui/left.webp"), "utf8"), "final left");
  assert.equal(readFileSync(join(root, "public/images/ui/left.webp"), "utf8"), "final left");
});
