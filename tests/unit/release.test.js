import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("发布版本在页面、包、manifest 与 Service Worker 中一致", async () => {
  const [html, packageText, manifestText, worker] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("manifest.webmanifest", root), "utf8"),
    readFile(new URL("service-worker.js", root), "utf8")
  ]);
  const packageJson = JSON.parse(packageText);
  const manifest = JSON.parse(manifestText);
  assert.equal(packageJson.version, "2.0.1");
  assert.equal(manifest.version, "2.0.1");
  assert.match(html, /v2\.0\.1/);
  assert.match(worker, /const VERSION = "2\.0\.1"/);
});
