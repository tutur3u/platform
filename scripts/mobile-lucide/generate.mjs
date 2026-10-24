#!/usr/bin/env node

// Generates the mobile Lucide icon fonts and Dart classes from the web's
// pinned lucide-react and @lucide/lab (versions and integrity from bun.lock).
//
//   cd scripts/mobile-lucide && npm ci
//   node generate.mjs --repo ../..            # downloads verified tarballs
//
// Why a font: the app passes icons as IconData (Icon, IconButton, shell
// action specs), which only a font provides. Lucide icons are 2px round
// strokes, so each glyph is the Skia stroke outline (CanvasKit Path.stroke,
// round caps and joins, unioned with any filled shapes; CanvasKit 0.42
// path API: PathBuilder, makeStroked and MakeFromOp unions). Skia is the same
// geometry engine Flutter uses to draw strokes. The written font is parsed
// back and every serialized glyph is rasterised against the original stroked
// shapes; any glyph more than 1% off fails the run.
// Output is deterministic: sorted names, fixed font timestamps.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import CanvasKitInit from 'canvaskit-wasm';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const sources = require('./sources.js');

const UNITS = 960; // 40 font units per 24px-grid unit.
const SCALE = UNITS / 24;
const FIXED_TIME = Date.UTC(2024, 0, 1);
const PARITY_PX = 96;
const MAX_MISMATCH = 0.01;
const SAMPLES = {
  base: [
    'house',
    'search',
    'x',
    'check',
    'settings',
    'bell',
    'calendar',
    'user',
    'earth',
    'chevron-right',
    'trash',
    'circle-alert',
    'ellipsis',
    'grip-vertical',
    'loader-circle',
    'star',
  ],
  lab: [
    'apple-core',
    'ampersand-square',
    'arrows-up-down-square',
    'bottle-champagne',
    'cat-big',
    'burger',
    'flower-lotus',
    'hat-top',
  ],
};

function args() {
  const argv = process.argv.slice(2);
  const value = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const repo = path.resolve(value('--repo', '../..'));
  return {
    repo,
    cache: path.resolve(
      value('--cache', path.join(os.tmpdir(), 'mobile-lucide'))
    ),
  };
}

function verifiedTarball({ name, version, integrity }, cache) {
  fs.mkdirSync(cache, { recursive: true });
  const base = name.split('/').pop();
  const file = path.join(cache, `${base}-${version}.tgz`);
  if (!fs.existsSync(file)) {
    const url = `https://registry.npmjs.org/${name}/-/${base}-${version}.tgz`;
    execFileSync('curl', ['-fsSL', '-o', file, url]);
  }
  const digest = `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
  if (digest !== integrity) {
    fs.rmSync(file);
    throw new Error(
      `${name}@${version} integrity mismatch; expected the bun.lock hash.`
    );
  }
  const dir = path.join(cache, `${base}-${version}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  execFileSync('tar', ['-xzf', file, '-C', dir]);
  return path.join(dir, 'package');
}

function readBase(pkg) {
  const dir = path.join(pkg, 'dist/esm/icons');
  const icons = [];
  const aliasFiles = [];
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()) {
    const parsed = sources.parseIconModule(
      fs.readFileSync(path.join(dir, file), 'utf8')
    );
    if (parsed?.name) icons.push(parsed);
    else if (parsed?.aliasOf)
      aliasFiles.push({ alias: file.slice(0, -4), target: parsed.aliasOf });
  }
  // Alias modules (home.mjs -> house.mjs) are web names too.
  const byName = new Map(icons.map((icon) => [icon.name, icon]));
  for (const { alias, target } of aliasFiles) {
    const icon = byName.get(target);
    if (!icon) throw new Error(`Alias ${alias} points at missing ${target}.`);
    icon.aliases = [...icon.aliases, alias];
  }
  return icons;
}

function readLab(pkg) {
  const nodes = JSON.parse(
    fs.readFileSync(path.join(pkg, 'icon-nodes.json'), 'utf8')
  );
  return Object.keys(nodes)
    .sort()
    .map((name) => ({ name, node: nodes[name], aliases: [] }));
}

/** One shape as an (immutable) Skia path in the 24-unit grid. */
function shapePath(ck, shape) {
  if (shape.kind === 'path') {
    const parsed = ck.Path.MakeFromSVGString(shape.d);
    if (!parsed) throw new Error(`Bad path data: ${shape.d}`);
    return parsed;
  }
  const builder = new ck.PathBuilder();
  switch (shape.kind) {
    case 'circle':
      builder.addCircle(shape.cx, shape.cy, shape.r);
      break;
    case 'ellipse':
      builder.addOval(
        ck.LTRBRect(
          shape.cx - shape.rx,
          shape.cy - shape.ry,
          shape.cx + shape.rx,
          shape.cy + shape.ry
        )
      );
      break;
    case 'rect': {
      const rx = Math.min(shape.rx ?? shape.ry ?? 0, shape.width / 2);
      const ry = Math.min(shape.ry ?? shape.rx ?? 0, shape.height / 2);
      builder.addRRect(
        ck.RRectXY(
          ck.XYWHRect(shape.x ?? 0, shape.y ?? 0, shape.width, shape.height),
          rx,
          ry
        )
      );
      break;
    }
    case 'line':
      builder.moveTo(shape.x1, shape.y1);
      builder.lineTo(shape.x2, shape.y2);
      break;
    case 'polyline':
    case 'polygon':
      builder.addPolygon(
        shape.points
          .trim()
          .split(/[\s,]+/u)
          .map(Number),
        shape.kind === 'polygon'
      );
      break;
    default:
      throw new Error(`Unsupported ${shape.kind}`);
  }
  return builder.detachAndDelete();
}

// Stroke at a high resolution scale: at the 24-unit grid Skia's default
// (1) approximates small round shapes coarser than the web's device-scale
// stroke, visibly so for r=1 dots.
const STROKE = (ck) => ({
  precision: 64,
  width: 2,
  cap: ck.StrokeCap.Round,
  join: ck.StrokeJoin.Round,
  miter_limit: 4,
});

/** Union of every stroked shape (2px, round) and every filled shape. */
function outline(ck, shapes) {
  let union = new ck.PathBuilder().detachAndDelete();
  for (const shape of shapes) {
    const base = shapePath(ck, shape);
    const parts = [base.makeStroked(STROKE(ck))];
    if (shape.filled) parts.push(base.copy());
    base.delete();
    for (const part of parts) {
      if (!part) throw new Error('Stroking failed.');
      const next = ck.Path.MakeFromOp(union, part, ck.PathOp.Union);
      if (!next) throw new Error('Path union failed.');
      union.delete();
      part.delete();
      union = next;
    }
  }
  // PathOps unions return simplified, non-overlapping even-odd paths, but
  // font outlines always fill nonzero: alternate contour direction with
  // nesting depth so holes survive (Skia's AsWinding rejects some paths).
  const winding = ck.Path.MakeFromSVGString(
    sources.orientForNonzero(union.toSVGString())
  );
  union.delete();
  if (!winding) throw new Error('Winding conversion failed.');
  return winding;
}

/** Share of ink pixels that differ between the web rendering and the glyph. */
function mismatch(ck, shapes, glyph) {
  const scale = PARITY_PX / 24;
  const draw = (paintShapes) => {
    const surface = ck.MakeSurface(PARITY_PX, PARITY_PX);
    const canvas = surface.getCanvas();
    canvas.clear(ck.TRANSPARENT);
    canvas.scale(scale, scale);
    paintShapes(canvas);
    const rgba = canvas.readPixels(0, 0, {
      width: PARITY_PX,
      height: PARITY_PX,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    surface.delete();
    if (!rgba) throw new Error('Could not read the parity raster.');
    // Coverage is the alpha channel.
    return rgba.filter((_, index) => index % 4 === 3);
  };
  const reference = draw((canvas) => {
    const stroke = new ck.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(ck.PaintStyle.Stroke);
    stroke.setStrokeWidth(2);
    stroke.setStrokeCap(ck.StrokeCap.Round);
    stroke.setStrokeJoin(ck.StrokeJoin.Round);
    const fill = new ck.Paint();
    fill.setAntiAlias(true);
    for (const shape of shapes) {
      const p = shapePath(ck, shape);
      if (shape.filled) canvas.drawPath(p, fill);
      canvas.drawPath(p, stroke);
      p.delete();
    }
    stroke.delete();
    fill.delete();
  });
  const candidate = draw((canvas) => {
    const fill = new ck.Paint();
    fill.setAntiAlias(true);
    canvas.drawPath(glyph, fill);
    fill.delete();
  });
  let ink = 0;
  let differ = 0;
  for (let i = 0; i < reference.length; i++) {
    if (reference[i] > 0 || candidate[i] > 0) ink++;
    // Count pixels whose coverage differs by more than half (visible).
    if (Math.abs(reference[i] - candidate[i]) > 128) differ++;
  }
  return ink === 0 ? 1 : differ / ink;
}

/** Skia SVG path (absolute M/L/Q/C/Z) -> font-space opentype path. */
function fontPath(svg) {
  const out = new opentype.Path();
  const tokens = svg.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/giu) ?? [];
  const X = (v) => Math.round(Number(v) * SCALE);
  const Y = (v) => Math.round((24 - Number(v)) * SCALE);
  let i = 0;
  let command = null;
  while (i < tokens.length) {
    if (/^[MLQCZ]$/iu.test(tokens[i])) command = tokens[i++].toUpperCase();
    switch (command) {
      case 'M':
        out.moveTo(X(tokens[i]), Y(tokens[i + 1]));
        i += 2;
        command = 'L';
        break;
      case 'L':
        out.lineTo(X(tokens[i]), Y(tokens[i + 1]));
        i += 2;
        break;
      case 'Q':
        out.quadraticCurveTo(
          X(tokens[i]),
          Y(tokens[i + 1]),
          X(tokens[i + 2]),
          Y(tokens[i + 3])
        );
        i += 4;
        break;
      case 'C':
        out.curveTo(
          X(tokens[i]),
          Y(tokens[i + 1]),
          X(tokens[i + 2]),
          Y(tokens[i + 3]),
          X(tokens[i + 4]),
          Y(tokens[i + 5])
        );
        i += 6;
        break;
      case 'Z':
        out.close();
        command = null;
        break;
      default:
        throw new Error(`Unexpected path token ${tokens[i]}`);
    }
  }
  return out;
}

/** A parsed font glyph's outline as SVG path data in the 24-unit grid. */
function glyphSvg(glyph) {
  const x = (v) => (v / SCALE).toFixed(4);
  const y = (v) => (24 - v / SCALE).toFixed(4);
  return glyph.path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${x(c.x)} ${y(c.y)}`;
        case 'Q':
          return `Q${x(c.x1)} ${y(c.y1)} ${x(c.x)} ${y(c.y)}`;
        case 'C':
          return `C${x(c.x1)} ${y(c.y1)} ${x(c.x2)} ${y(c.y2)} ${x(c.x)} ${y(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error(`Unexpected glyph command ${c.type}`);
      }
    })
    .join('');
}

/** Rejects any serialized glyph that differs from the web by > 1%. */
function verifySerialized(ck, font, planned, shapesByName) {
  const parsed = opentype.parse(
    font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength)
  );
  let worst = { name: null, ratio: 0 };
  for (const glyph of planned) {
    const shipped = parsed.charToGlyph(String.fromCodePoint(glyph.codepoint));
    if (!shipped || shipped.unicode !== glyph.codepoint) {
      throw new Error(`${glyph.name}: glyph missing from the serialized font.`);
    }
    const path = ck.Path.MakeFromSVGString(glyphSvg(shipped));
    if (!path) throw new Error(`${glyph.name}: unreadable serialized glyph.`);
    const ratio = mismatch(ck, shapesByName.get(glyph.name), path);
    path.delete();
    if (ratio > worst.ratio) worst = { name: glyph.name, ratio };
    if (ratio > MAX_MISMATCH) {
      throw new Error(
        `${glyph.name}: serialized glyph differs from the web rendering (${(ratio * 100).toFixed(2)}%).`
      );
    }
  }
  return worst;
}

function buildFont(family, glyphs) {
  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: UNITS,
    path: new opentype.Path(),
  });
  const font = new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm: UNITS,
    ascender: UNITS,
    descender: 0,
    createdTimestamp: FIXED_TIME / 1000,
    glyphs: [
      notdef,
      ...glyphs.map(
        (g) =>
          new opentype.Glyph({
            name: g.name,
            unicode: g.codepoint,
            advanceWidth: UNITS,
            path: g.path,
          })
      ),
    ],
  });
  // opentype.js stamps `modified` with the current time; pin it.
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [FIXED_TIME]));
    }
  };
  try {
    return Buffer.from(font.toArrayBuffer());
  } finally {
    globalThis.Date = RealDate;
  }
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function main() {
  const { repo, cache } = args();
  const lock = fs.readFileSync(path.join(repo, 'bun.lock'), 'utf8');
  const ck = await CanvasKitInit();
  const mobile = path.join(repo, 'apps/mobile');
  const fontDir = path.join(mobile, 'assets/fonts/lucide');
  const dartDir = path.join(mobile, 'lib/core/ui/icons/generated');
  fs.mkdirSync(fontDir, { recursive: true });
  fs.mkdirSync(dartDir, { recursive: true });
  const manifest = {
    generator: 'scripts/mobile-lucide/generate.mjs',
    glyphGrid: 24,
    strokeWidth: 2,
    unitsPerEm: UNITS,
    sets: {},
    files: {},
  };
  const samples = {};
  for (const kind of ['base', 'lab']) {
    const spec = sources.PACKAGES[kind];
    const entry = sources.lockEntry(lock, spec.name);
    if (!entry) throw new Error(`${spec.name} not found in bun.lock.`);
    const pkg = verifiedTarball({ name: spec.name, ...entry }, cache);
    const licenseFile = `assets/fonts/lucide/LICENSE-${kind === 'base' ? 'lucide' : 'lucide-lab'}.txt`;
    fs.copyFileSync(path.join(pkg, 'LICENSE'), path.join(mobile, licenseFile));
    const icons = kind === 'base' ? readBase(pkg) : readLab(pkg);
    const plan = sources.planGlyphs(icons);
    const byName = new Map(icons.map((icon) => [icon.name, icon]));
    const shapesByName = new Map();
    const glyphs = plan.glyphs.map((glyph) => {
      const shapes = sources.normaliseNode(
        byName.get(glyph.name).node,
        glyph.name
      );
      shapesByName.set(glyph.name, shapes);
      const shape = outline(ck, shapes);
      const svg = shape.toSVGString();
      shape.delete();
      return { ...glyph, path: fontPath(svg) };
    });
    const font = buildFont(spec.font, glyphs);
    const fontFile = `assets/fonts/lucide/${spec.font}.otf`;
    fs.writeFileSync(path.join(mobile, fontFile), font);
    // Gate the shipped artefact: reopen the written file and compare every
    // glyph (after coordinate rounding and CFF encoding) with the web
    // rendering of its SVG node.
    const worst = verifySerialized(
      ck,
      fs.readFileSync(path.join(mobile, fontFile)),
      plan.glyphs,
      shapesByName
    );
    const dart = sources.emitDart({
      kind,
      version: entry.version,
      licenseFile,
      glyphs: plan.glyphs,
      aliases: plan.aliases,
    });
    const dartFile = `lib/core/ui/icons/generated/${kind === 'base' ? 'lucide_icons' : 'lucide_lab_icons'}.g.dart`;
    fs.writeFileSync(path.join(mobile, dartFile), dart);
    manifest.sets[kind] = {
      package: spec.name,
      version: entry.version,
      integrity: entry.integrity,
      icons: plan.glyphs.length,
      aliases: plan.aliases.length,
      skippedAliases: plan.skippedAliases,
      maxParityMismatch: Number(worst.ratio.toFixed(5)),
      worstIcon: worst.name,
    };
    for (const file of [fontFile, dartFile, licenseFile]) {
      manifest.files[file] = sha256(fs.readFileSync(path.join(mobile, file)));
    }
    samples[kind] = SAMPLES[kind].map((name) => {
      const icon = byName.get(name);
      if (!icon) throw new Error(`Sample ${name} missing from ${spec.name}.`);
      const glyph = plan.glyphs.find((g) => g.name === name);
      return {
        name,
        dartName: glyph.dartName,
        codepoint: glyph.codepoint,
        svg: sources.svgMarkup(icon.node),
      };
    });
  }
  const fixture = 'test/fixtures/lucide/parity_samples.json';
  fs.mkdirSync(path.dirname(path.join(mobile, fixture)), { recursive: true });
  fs.writeFileSync(
    path.join(mobile, fixture),
    `${JSON.stringify(samples, null, 2)}\n`
  );
  manifest.files[fixture] = sha256(fs.readFileSync(path.join(mobile, fixture)));
  fs.writeFileSync(
    path.join(dartDir, 'lucide_manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(
    `base ${manifest.sets.base.icons} icons (+${manifest.sets.base.aliases} aliases), lab ${manifest.sets.lab.icons}; worst parity ${manifest.sets.base.maxParityMismatch}/${manifest.sets.lab.maxParityMismatch}.`
  );
}

await main();
