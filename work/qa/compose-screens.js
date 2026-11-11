"use strict";

// Lays labelled screenshots side by side in one image.
// Usage: node work/qa/compose-screens.js <out.png> "<title>" "<label>=<file.png>" ["<label>=<file.png>" ...]
const fs = require("fs");
const { loadPlaywright } = require("./common");

const [out, title, ...items] = process.argv.slice(2);
if (!out || !items.length) {
  console.error('Usage: node work/qa/compose-screens.js <out.png> "<title>" "<label>=<file.png>" ...');
  process.exit(2);
}
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const figures = items.map((item) => {
    const split = item.indexOf("=");
    const data = fs.readFileSync(item.slice(split + 1)).toString("base64");
    return `<figure><figcaption>${escape(item.slice(0, split))}</figcaption><img src="data:image/png;base64,${data}"></figure>`;
  }).join("");
  await page.setContent(`<body style="margin:0;padding:20px;background:#fff;font:700 20px system-ui;display:inline-block">
    <div style="margin-bottom:12px;font-size:22px">${escape(title || "")}</div><div style="display:flex;gap:18px">${figures}</div>
    <style>figure{margin:0}figcaption{margin-bottom:8px}img{width:300px;border:1px solid #bbb;border-radius:10px;display:block}</style></body>`);
  await page.waitForTimeout(300);
  const size = await page.evaluate(() => { const box = document.body.getBoundingClientRect(); return { width: Math.ceil(box.width), height: Math.ceil(box.height) }; });
  await page.setViewportSize(size);
  await page.screenshot({ path: out });
  await browser.close();
})();
