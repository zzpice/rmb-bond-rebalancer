// Minimal dependency-free static server for unit-adjacent browser tests.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostIndex = process.argv.indexOf("--host");
const portIndex = process.argv.indexOf("--port");
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : "127.0.0.1";
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = path.resolve(root, "." + path.normalize(urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, host, () => {
  console.log(`test server listening on http://${host}:${port}/`);
});
