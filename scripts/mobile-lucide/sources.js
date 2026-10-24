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

module.exports = {
  DART_RESERVED,
  FIRST_CODEPOINT,
  PACKAGES,
  dartName,
  emitDart,
  lockEntry,
  normaliseNode,
  parseIconModule,
  planGlyphs,
  svgMarkup,
};
