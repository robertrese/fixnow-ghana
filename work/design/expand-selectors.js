"use strict";

// Expands :is(...) and :where(...) into plain selector lists, for browsers that lack them (Chrome and Android WebView
// before 88, Safari before 14). An old browser drops a whole rule it cannot parse, so one :is() hides every style in it.
//   [data-theme="dark"] :is(.a, .b button){...}  ->  [data-theme="dark"] body .a, [data-theme="dark"] .b button{...}
// :is() gives every item the specificity of its strongest item. To keep the cascade exactly the same, an item that is
// weaker only by element count is padded with "body " (every styled element is inside <body>). Anything else that
// would change specificity, and any :where() (zero specificity), stops the build instead of silently changing styles.

function splitTopLevel(text) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

// [ids, classes/attributes/pseudo-classes, elements/pseudo-elements] for the simple selectors used in this project.
function specificity(selector) {
  const s = selector.replace(/\[[^\]]*\]/g, (m) => " .attr ");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length + (s.match(/(^|[^:]):(?!:)[\w-]+/g) || []).length;
  const elements = (s.replace(/[.#:][\w-]+(\([^)]*\))?/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length + (s.match(/::[\w-]+/g) || []).length;
  return [ids, classes, elements];
}

function expandSelector(selector) {
  const match = /:(is|where)\(/.exec(selector);
  if (!match) return [selector];
  if (match[1] === "where") throw new Error(`:where() cannot be expanded without changing specificity: ${selector}`);
  const open = match.index + match[0].length - 1;
  let depth = 0, close = open;
  for (; close < selector.length; close++) { if (selector[close] === "(") depth++; else if (selector[close] === ")") { depth--; if (depth === 0) break; } }
  const items = splitTopLevel(selector.slice(open + 1, close));
  const specs = items.map(specificity);
  const max = specs.reduce((a, b) => (a[0] !== b[0] ? (a[0] > b[0] ? a : b) : a[1] !== b[1] ? (a[1] > b[1] ? a : b) : (a[2] >= b[2] ? a : b)));
  const before = selector.slice(0, match.index), after = selector.slice(close + 1);
  return items.flatMap((item, i) => {
    const [ids, classes, elements] = specs[i];
    if (ids !== max[0] || classes !== max[1]) throw new Error(`:is() item "${item}" has different id or class specificity from "${items[specs.indexOf(max)]}"; expand it by hand: ${selector}`);
    // Padding with "body " only works when :is() is not the first compound of the selector after the root.
    const padding = "body ".repeat(max[2] - elements);
    if (padding && !/\s$/.test(before)) throw new Error(`Cannot pad "${item}" in ${selector}`);
    return expandSelector(`${before}${padding}${item}${after}`);
  });
}

function expandCss(css) {
  // Works on the minified layer (one rule or at-rule opening per line) and on readable CSS alike.
  return css.replace(/(^|[{}]\s*)([^{}@]+?)\{/g, (whole, lead, prelude) => {
    if (!/:(is|where)\(/.test(prelude)) return whole;
    return lead + splitTopLevel(prelude).flatMap(expandSelector).join(",") + "{";
  });
}

module.exports = { expandCss, expandSelector, specificity };
