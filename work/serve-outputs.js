"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2] || 4173);
const root = path.resolve(__dirname, "..", "outputs");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".apk": "application/vnd.android.package-archive",
  ".aab": "application/octet-stream",
  ".zip": "application/zip",
  ".md": "text/markdown; charset=utf-8"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/fixnow-ghana.html" : url.pathname);
  const file = path.resolve(root, requested.replace(/^\/+/, ""));
  if (!file.startsWith(root)) return send(res, 403, "Forbidden");

  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, "Not found");
    send(res, 200, data, types[path.extname(file).toLowerCase()] || "application/octet-stream");
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
