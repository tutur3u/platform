// Pure helpers for the mobile Lucide generator (no third-party deps).
//
// They read the web's pinned icon sources (lucide-react ESM icon modules and
// @lucide/lab icon-nodes.json), derive web-matching Dart names and aliases,
// and emit the generated Dart classes. The geometry stage lives in
// generate.mjs. See apps/docs/build/development-tools/mobile-design-system.mdx.

const PACKAGES = {
  base: { name: 'lucide-react', dartClass: 'LucideIcons', font: 'LucideIcons' },
  lab: {
    name: '@lucide/lab',
    dartClass: 'LucideLabIcons',
    font: 'LucideLabIcons',
  },
};

// Dart reserved words that cannot be identifiers; built-in identifiers such
// as `import` are allowed as static member names.
const DART_RESERVED = new Set(
  (
    'assert break case catch class const continue default do else enum ' +
    'extends false final finally for if in is new null rethrow return ' +
    'super switch this throw true try var void when while with'
  ).split(' ')
);

const FIRST_CODEPOINT = 0xe000;

/** `{ version, integrity }` of `name` from a bun.lock text, or null. */
function lockEntry(lockText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
  const pattern = new RegExp(
    `^\\s*"${escaped}": \\["${escaped}@([^"]+)", "[^"]*", (?:\\{[^\\n]*?\\}|\\{\\}), "(sha512-[^"]+)"\\]`,
    'mu'
  );
  const match = lockText.match(pattern);
  return match ? { version: match[1], integrity: match[2] } : null;
}

/** kebab-case icon name -> lowerCamelCase Dart identifier. */
function dartName(kebab) {
  const camel = kebab.replace(/-([a-z0-9])/gu, (_, c) => c.toUpperCase());
  const safe = /^[0-9]/u.test(camel) ? `icon${camel}` : camel;
  return DART_RESERVED.has(safe) ? `${safe}Icon` : safe;
}

/**
 * Parses a lucide-react ESM icon module. Returns `{ name, node, aliases }`
 * for a canonical icon, `{ aliasOf }` for an alias re-export module, or
 * null for anything else (such as index.mjs).
 */
function parseIconModule(text) {
  const data = text.match(/const __iconData = (\{[\s\S]*?\n\});/u);
  if (data) {
    const json = data[1].replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/gu, '$1"$2":');
    const parsed = JSON.parse(json);
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.node)) {
      throw new Error('Icon module without a name or node.');
    }
    return {
      name: parsed.name,
      node: parsed.node,
      aliases: parsed.aliases ?? [],
    };
  }
  const alias = text.match(/export \{ default \} from '\.\/([^']+)\.mjs';/u);
  return alias ? { aliasOf: alias[1] } : null;
}

const NUMBER = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${label}: ${value}`);
  return number;
};

const ALLOWED = {
  path: ['d'],
  circle: ['cx', 'cy', 'r', 'fill'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'fill'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points', 'fill'],
};

/**
 * Validates and normalises one icon node into shapes the geometry stage
 * understands: `{ kind, ...numbers, d?, points?, filled }`. Unknown elements
 * or attributes throw, so a new Lucide feature can never be dropped
 * silently.
 */
function normaliseNode(node, iconName) {
  return node.map(([tag, rawAttrs]) => {
    const allowed = ALLOWED[tag];
    if (!allowed) throw new Error(`${iconName}: unsupported <${tag}>`);
    const attrs = { ...rawAttrs };
    delete attrs.key;
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) {
        throw new Error(`${iconName}: unsupported ${tag}.${key}`);
      }
    }
    const fill = attrs.fill;
    if (fill !== undefined && fill !== 'none' && fill !== 'currentColor') {
      throw new Error(`${iconName}: unsupported fill ${fill}`);
    }
    const shape = { kind: tag, filled: fill === 'currentColor' };
    for (const key of allowed) {
      if (key === 'fill' || attrs[key] === undefined) continue;
      shape[key] =
        key === 'd' || key === 'points'
          ? String(attrs[key])
          : NUMBER(attrs[key], `${iconName} ${tag}.${key}`);
    }
    return shape;
  });
}

/** The SVG markup lucide-react renders for a node at 24px (for parity). */
function svgMarkup(node) {
  const children = node
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${rendered}/>`;
    })
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
  );
}

/**
 * Assigns codepoints in sorted name order and resolves aliases.
 * `icons` is `[{ name, aliases }]`. Returns `{ glyphs, aliases }` where
 * aliases colliding with a canonical name or with each other are dropped
 * and reported in `skippedAliases`.
 */
function planGlyphs(icons) {
  const sorted = [...icons].sort((a, b) => (a.name < b.name ? -1 : 1));
  const glyphs = sorted.map((icon, index) => ({
    name: icon.name,
    dartName: dartName(icon.name),
    codepoint: FIRST_CODEPOINT + index,
  }));
  const taken = new Map(glyphs.map((glyph) => [glyph.dartName, glyph.name]));
  if (taken.size !== glyphs.length) {
    throw new Error('Two icon names map to the same Dart identifier.');
  }
  const aliases = [];
  const skippedAliases = [];
  for (const icon of sorted) {
    for (const alias of [...new Set(icon.aliases ?? [])].sort()) {
      const name = dartName(alias);
      if (taken.has(name)) {
        // e.g. `arrow-down-01` and `arrow-down-0-1` are both `arrowDown01`.
        skippedAliases.push({
          alias,
          target: icon.name,
          reason: 'same Dart name',
        });
        continue;
      }
      taken.set(name, alias);
      aliases.push({ alias, dartName: name, target: dartName(icon.name) });
    }
  }
  return { glyphs, aliases, skippedAliases };
}

function dartHeader({ source, version, licenseFile }) {
  return [
    '// GENERATED CODE - DO NOT MODIFY BY HAND.',
    `// Generated by scripts/mobile-lucide/generate.mjs from ${source} ${version}.`,
    `// Icons are ISC licensed; see ${licenseFile}.`,
    '// Regenerate whenever the web version changes; CI checks the manifest.',
    '',
    "import 'package:flutter/widgets.dart';",
    '',
  ].join('\n');
}

/** Lays out a const declaration the way `dart format` does at 80 columns. */
function constLine(name, value, args) {
  const single = `  static const IconData ${name} = ${value}${args ? `(${args.join(', ')})` : ''};`;
  if (single.length <= 80) return [single];
  if (!args) return [`  static const IconData ${name} =`, `      ${value};`];
  return [
    `  static const IconData ${name} = ${value}(`,
    ...args.map((arg) => `    ${arg},`),
    '  );',
  ];
}

/** Emits a Dart class of `IconData` constants for one icon font. */
function emitDart({ kind, version, licenseFile, glyphs, aliases }) {
  const spec = PACKAGES[kind];
  const lines = [
    dartHeader({ source: spec.name, version, licenseFile }),
    `/// ${kind === 'base' ? 'Lucide' : 'Lucide Lab'} icons at the web's pinned \`${spec.name}\` ${version}.`,
    '///',
    '/// Names are the web icon names in lowerCamelCase (`arrow-right` is',
    '/// `arrowRight`). Glyphs are the 2px round-stroked outlines the web',
    '/// renders at 24px, so `Icon(size: 24)` matches the web icon.',
    `abstract final class ${spec.dartClass} {`,
    `  static const String fontFamily = '${spec.font}';`,
  ];
  for (const glyph of glyphs) {
    lines.push(
      '',
      `  /// \`${glyph.name}\``,
      ...constLine(glyph.dartName, 'IconData', [
        `0x${glyph.codepoint.toString(16)}`,
        'fontFamily: fontFamily',
      ])
    );
  }
  for (const alias of aliases) {
    lines.push(
      '',
      `  /// Web alias \`${alias.alias}\` of [${alias.target}].`,
      ...constLine(alias.dartName, alias.target)
    );
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** Parses absolute M/L/Q/C/Z path data into contours of segments. */
function parseContours(svg) {
  const tokens = svg.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/giu) ?? [];
  const contours = [];
  let current = null;
  let command = null;
  let i = 0;
  const take = (n) => {
    const values = tokens.slice(i, i + n).map(Number);
    i += n;
    return values;
  };
  while (i < tokens.length) {
    if (/^[MLQCZ]$/iu.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === 'M') {
      const [x, y] = take(2);
      current = { start: [x, y], segments: [] };
      contours.push(current);
      command = 'L';
    } else if (command === 'L') {
      current.segments.push({ type: 'L', points: [take(2)] });
    } else if (command === 'Q') {
      const v = take(4);
      current.segments.push({ type: 'Q', points: [v.slice(0, 2), v.slice(2)] });
    } else if (command === 'C') {
      const v = take(6);
      current.segments.push({
        type: 'C',
        points: [v.slice(0, 2), v.slice(2, 4), v.slice(4)],
      });
    } else if (command === 'Z') {
      command = null;
    } else {
      throw new Error(`Unexpected path token ${tokens[i]}`);
    }
  }
  return contours.filter((contour) => contour.segments.length > 0);
}

// Curves are flattened adaptively until every control point lies within
// FLATNESS of the chord (bounded by MAX_DEPTH splits), so nesting tests see
// the true curve: a hole just inside a bulging curve stays inside.
const FLATNESS = 1e-4; // grid units (24 per icon); far below a font unit.
const MAX_DEPTH = 18;

function split(ctrl) {
  const left = [ctrl[0]];
  const right = [ctrl.at(-1)];
  let level = ctrl;
  while (level.length > 1) {
    level = level
      .slice(1)
      .map((p, j) => [(level[j][0] + p[0]) / 2, (level[j][1] + p[1]) / 2]);
    left.push(level[0]);
    right.unshift(level.at(-1));
  }
  return [left, right];
}

function flatEnough(ctrl) {
  const [x0, y0] = ctrl[0];
  const [x1, y1] = ctrl.at(-1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  return ctrl.slice(1, -1).every(([x, y]) => {
    const distance =
      length === 0
        ? Math.hypot(x - x0, y - y0)
        : Math.abs(dy * (x - x0) - dx * (y - y0)) / length;
    return distance <= FLATNESS;
  });
}

function flattenCurve(ctrl, depth, out) {
  if (depth >= MAX_DEPTH || flatEnough(ctrl)) {
    out.push(ctrl.at(-1));
    return;
  }
  const [left, right] = split(ctrl);
  flattenCurve(left, depth + 1, out);
  flattenCurve(right, depth + 1, out);
}

/** Polyline approximation of a contour, accurate to FLATNESS. */
function flatten(contour) {
  const points = [contour.start];
  let from = contour.start;
  for (const segment of contour.segments) {
    const end = segment.points.at(-1);
    if (segment.type === 'L') points.push(end);
    else flattenCurve([from, ...segment.points], 0, points);
    from = end;
  }
  return points;
}

const signedArea = (poly) =>
  poly.reduce((sum, [x, y], k) => {
    const [nx, ny] = poly[(k + 1) % poly.length];
    return sum + x * ny - nx * y;
  }, 0);

function inside([x, y], poly) {
  let hit = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a];
    const [xb, yb] = poly[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) {
      hit = !hit;
    }
  }
  return hit;
}

function reverse(contour) {
  const nodes = [
    contour.start,
    ...contour.segments.map((s) => s.points.at(-1)),
  ];
  const segments = [];
  for (let k = contour.segments.length - 1; k >= 0; k--) {
    const segment = contour.segments[k];
    const controls = segment.points.slice(0, -1).reverse();
    segments.push({ type: segment.type, points: [...controls, nodes[k]] });
  }
  return { start: nodes.at(-1), segments };
}

const fmt = (v) => Number(v.toFixed(5)).toString();

/**
 * Re-orients the contours of a non-overlapping even-odd path (Skia PathOps
 * output) so it fills identically under the nonzero rule used by fonts:
 * contours alternate direction with their nesting depth.
 */
function orientForNonzero(svg) {
  const contours = parseContours(svg);
  const polys = contours.map(flatten);
  return contours
    .map((contour, index) => {
      const probe = polys[index][0];
      const depth = polys.filter(
        (poly, other) => other !== index && inside(probe, poly)
      ).length;
      const positive = signedArea(polys[index]) > 0;
      const wantPositive = depth % 2 === 0;
      const oriented = positive === wantPositive ? contour : reverse(contour);
      const parts = [`M${fmt(oriented.start[0])} ${fmt(oriented.start[1])}`];
      for (const segment of oriented.segments) {
        parts.push(
          segment.type +
            segment.points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' ')
        );
      }
      return `${parts.join('')}Z`;
    })
    .join('');
}

module.exports = {
  DART_RESERVED,
  FIRST_CODEPOINT,
  PACKAGES,
  dartName,
  emitDart,
  lockEntry,
  normaliseNode,
  orientForNonzero,
  parseContours,
  parseIconModule,
  planGlyphs,
  svgMarkup,
};
