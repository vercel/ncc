// The asset relocator rewrites identifiers bound to __dirname / __filename
// path joins. When those identifiers are later used as object-literal
// shorthand (`{ defaultDir }`), it emits invalid JS:
//   module.exports = { __webpack_require__.ab + "bin", bin }
// Expand those shorthands first so the key stays an identifier.
// See https://github.com/vercel/ncc/issues/1255

module.exports = function (input, map) {
  this.callback(null, expandDirnameShorthand(input), map);
};

function expandDirnameShorthand(input) {
  if (typeof input !== "string") return input;
  if (!/\b__(?:dirname|filename)\b/.test(input)) return input;

  const names = collectDirnameBindings(input);
  if (!names.length) return input;

  return expandExportShorthand(input, names);
}

function collectDirnameBindings(source) {
  const names = [];
  const seen = Object.create(null);
  const re = /(?:^|[^\w.$])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  let match;
  while ((match = re.exec(source))) {
    if (!/\b__(?:dirname|filename)\b/.test(match[2])) continue;
    if (seen[match[1]]) continue;
    seen[match[1]] = true;
    names.push(match[1]);
  }
  return names;
}

function expandExportShorthand(source, names) {
  const nameAlt = names.map(escapeRegExp).join("|");
  const propRe = new RegExp(
    `(^|[,\\n])([ \\t]*)(${nameAlt})([ \\t]*)(?=,|\\n|$)`,
    "gm"
  );

  const ranges = [];
  const openRe = /(?:module\.)?exports\s*=\s*\{/g;
  let match;
  while ((match = openRe.exec(source))) {
    const brace = match.index + match[0].length - 1;
    const close = matchingBrace(source, brace);
    if (close !== -1) ranges.push([brace + 1, close]);
  }
  if (!ranges.length) return source;

  let out = source;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i];
    const body = out.slice(start, end).replace(propRe, `$1$2$3:$4$3`);
    out = out.slice(0, start) + body + out.slice(end);
  }
  return out;
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports.expandDirnameShorthand = expandDirnameShorthand;
