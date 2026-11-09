"use strict";

// Compiles the readable design source (work/design/fixnow-v3.css) into the
// <style id="fixnow-v3"> block of outputs/fixnow-ghana.html.
// Edit the .css file, then run: npm run build:css
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const htmlPath = path.join(root, "outputs", "fixnow-ghana.html");
const cssPath = path.join(__dirname, "fixnow-v3.css");
const tag = '<style id="fixnow-v3">';

const css = fs.readFileSync(cssPath, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s*\n\s*/g, "\n")
  .replace(/\s*\{\s*/g, "{")
  .replace(/;\s*\}/g, "}")
  .replace(/\s*\}\s*/g, "}\n")
  .replace(/;\s+/g, ";")
  .replace(/([{;])\s*([a-z-]+):\s+/g, "$1$2:")
  .replace(/\n+/g, "\n")
  .trim();

const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf(tag);
if (start === -1) throw new Error(`Could not find ${tag} in ${htmlPath}`);
const end = html.indexOf("</style>", start);
fs.writeFileSync(htmlPath, `${html.slice(0, start)}${tag}\n${css}\n${html.slice(end)}`);
console.log(`Design layer rebuilt: ${Buffer.byteLength(css)} bytes of CSS in outputs/fixnow-ghana.html`);
