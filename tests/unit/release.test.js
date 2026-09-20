import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("发布版本在页面、包、manifest、模块与 Service Worker 中一致", async () => {
  const [html, packageText, manifestText, portfolio, worker] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("manifest.webmanifest", root), "utf8"),
    readFile(new URL("src/portfolio.js", root), "utf8"),
    readFile(new URL("service-worker.js", root), "utf8")
  ]);
  const version = JSON.parse(packageText).version;
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.version, version);
  assert.ok(html.includes(`Version ${version}`) || html.includes(`v${version}`));
  assert.ok(portfolio.includes(`export const VERSION = "${version}"`));
  assert.ok(worker.includes(`const VERSION = "${version}"`));
});
