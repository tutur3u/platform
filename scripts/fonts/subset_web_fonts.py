#!/usr/bin/env python3
"""Hand-run font assets; never invoked by install, dev, CI, or build."""
import argparse
import hashlib
import json
import subprocess
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
REVISION = '6157dfaa640ca5738b4d1a7070fe389c3036d7fc'
UPSTREAM = f'https://raw.githubusercontent.com/google/fonts/{REVISION}/ofl/'
BVP_RANGES = [
    '102-103,110-111,128-129,168-169,1A0-1A1,1AF-1B0,300-301,303-304,308-309,323,329,1EA0-1EF9,20AB',
    '100-2BA,2BD-2C5,2C7-2CC,2CE-2D7,2DD-2FF,304,308,329,1D00-1DBF,1E00-1E9F,1EF2-1EFF,2020,20A0-20AB,20AD-20C4,2113,2C60-2C7F,A720-A7FF',
    '0-FF,131,152-153,2BB-2BC,2C6,2DA,2DC,304,308,329,2000-206F,20AC,2122,2191,2193,2212,2215,FEFF,FFFD',
]


def parse_ranges(value):
    chars = set()
    for token in value.replace('U+', '').split(','):
        ends = token.strip().split('-')
        chars.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
    return chars


FEATURES = ['calt', 'case', 'ccmp', 'cpsp', 'kern', 'liga', 'locl', 'mark', 'mkmk', 'pnum', 'rlig', 'tnum']
CORE_RANGES = [(0x20, 0x17F), (0x1A0, 0x1A1), (0x1AF, 0x1B0), (0x300, 0x36F), (0x1EA0, 0x1EF9), (0x2000, 0x206F), (0x20A0, 0x20CF), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD)]
SOURCES = [
    ('noto-sans', 'notosans/NotoSans[wdth,wght].ttf', 'bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d', {'wdth': 100}, '100 900'),
    ('be-vietnam-pro-500', 'bevietnampro/BeVietnamPro-Medium.ttf', 'b60832bfa0fcd015158112c64d7e3fdad3b0c6287d1823f85a3103636e845268', {}, '500'),
    ('be-vietnam-pro-600', 'bevietnampro/BeVietnamPro-SemiBold.ttf', 'bd8e27eb02720b9d91e59e4f10a90878643219f25ce6a8d9a4f06a8a88d3bb71', {}, '600'),
    ('be-vietnam-pro-700', 'bevietnampro/BeVietnamPro-Bold.ttf', '7f738fe5c43c8872807b20e2d30d42163618de8a4daf7f48a939adac32c16847', {}, '700'),
    ('be-vietnam-pro-800', 'bevietnampro/BeVietnamPro-ExtraBold.ttf', '44dbfa01553d227bec76ba6446c5618870a76a4a3297f41630dde859d0650d02', {}, '800'),
    ('jetbrains-mono', 'local', '9136b147774598c777d96371c6cc2dbc7904c6dfa6a37db809c3b57f0c36b329', {}, '100 800'),
    ('inter', 'inter/Inter[opsz,wght].ttf', '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031', {'opsz': 14}, '400 700'),
]
LICENSES = [
    ('notosans', 'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a'),
    ('bevietnampro', '6b7f8f73609a25ea78c891e34cf37b06f8a676b7ea986e941e43b009110f2a85'),
    ('inter', '5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57'),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def download(cache, relative, expected):
    remote = relative.startswith('https://fonts.gstatic.com/')
    file = cache / ('google-' + expected + '.woff2') if remote else cache / relative
    if not file.exists():
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(urlopen(relative if remote else UPSTREAM + quote(relative), timeout=60).read())
    if digest(file.read_bytes()) != expected:
        raise ValueError(f'Unexpected upstream bytes: {relative}')
    return file


def unicode_range(characters):
    groups = []
    for char in sorted(characters):
        if groups and char == groups[-1][1] + 1:
            groups[-1][1] = char
        else:
            groups.append([char, char])
    return ', '.join(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}' for a, b in groups)


def preserve_hyphen_aliases(font, slug):
    if (slug.startswith('be-vietnam-pro') or slug == 'noto-sans') and 0x2D in font.getBestCmap():
        # Chromium normalized these under Google's broad punctuation range.
        hyphen = font.getBestCmap()[0x2D]
        for table in font['cmap'].tables:
            if table.isUnicode():
                for codepoint in [0x2010, 0x2011]:
                    table.cmap.setdefault(codepoint, hyphen)


def metadata(font):
    tags = set(font.keys())
    return {
        'glyphs': len(font.getGlyphOrder()),
        'characters': len(font.getBestCmap()),
        'outlinedGlyphs': sum(font['glyf'][name].numberOfContours != 0 for name in font.getGlyphOrder()) if 'glyf' in font else None,
        'axes': {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {},
        'features': sorted({f.FeatureTag for tag in ['GSUB', 'GPOS'] if tag in font for f in font[tag].table.FeatureList.FeatureRecord}),
        'hintTables': sorted(tags.intersection(['fpgm', 'prep', 'cvt ', 'hdmx', 'VDMX', 'LTSH'])),
        'hintedGlyphs': sum(bool(getattr(glyph, 'program', None) and glyph.program.getBytecode()) for glyph in (font['glyf'][name] for name in font.getGlyphOrder())) if 'glyf' in font else 0,
    }


def face(family, slug, weight, display, manifest):
    rules = []
    outputs = manifest[slug]['outputs']
    order = ['vietnamese-core', 'latin-ext-extended', 'extended', 'latin-core'] if slug == 'noto-sans' else outputs.keys()
    for part in order:
        info = outputs[part]
        groups = [parse_ranges(info['unicodeRange'])]
        if part in ['vietnamese-core', 'latin-core', 'latin-ext-extended']:
            index = {'vietnamese-core': 0, 'latin-ext-extended': 1, 'latin-core': 2}[part]
            groups = [groups[0] & parse_ranges(BVP_RANGES[index])]
        for group in groups:
            if not group:
                continue
            rules.append(f'''@font-face {{
  font-family: "{family}";
  font-style: normal;
  font-weight: {weight};
  font-display: {display};
  src: url("/fonts/subsets/{slug}-{part}.woff2") format("woff2");
  unicode-range: {unicode_range(group)};
}}''')
    return '\n\n'.join(rules)


def fallback(family, ascent, descent, adjust):
    return f'''@font-face {{
  font-family: "{family}";
  src: local("Arial");
  ascent-override: {ascent}%;
  descent-override: {descent}%;
  line-gap-override: 0%;
  size-adjust: {adjust}%;
}}'''


def generate(cache):
    if fontTools.__version__ != '4.60.1':
        raise ValueError('Use fonttools[woff]==4.60.1 and brotli==1.1.0 for reproducible bytes')
    output = ROOT / 'apps/web/public/fonts/subsets'
    styles = ROOT / 'apps/web/src/fonts'
    output.mkdir(parents=True, exist_ok=True)
    styles.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for slug, relative, expected, axes, weight in SOURCES:
        source = ROOT / 'apps/web/src/app/[locale]/(marketing)/fonts/jetbrains-mono-variable.woff2' if relative == 'local' else download(cache, relative, expected)
        if digest(source.read_bytes()) != expected:
            raise ValueError(f'Unexpected source bytes: {source}')
        original = TTFont(source, recalcTimestamp=False)
        before = metadata(original)
        preserve_hyphen_aliases(original, slug)
        characters = set(original.getBestCmap())
        core = {c for c in characters if any(a <= c <= b for a, b in CORE_RANGES)}
        original_chunks = []
        if slug == 'noto-sans':
            for part, expected_hash in [
                ('vietnamese-core', '233281c01fdba521af3bb0bd691bf6f49b3e8c06d93d10c8f83f8fe07d8ff75f'),
                ('latin-core', 'afc7a910f4ff04ee2ff7b3a2ef8b24f8340b8ea8d8125f2779f1f0b69d1b56b9'),
            ]:
                chunk = ROOT / f'apps/colab/src/client/assets/fonts/noto-sans-{part.removesuffix("-core")}.woff2'
                if digest(chunk.read_bytes()) != expected_hash:
                    raise ValueError(f'Original Google font changed: {chunk}')
                original_chunks.append((part, chunk))
            core = set()
            for _, file in original_chunks:
                chunk_font = TTFont(file)
                preserve_hyphen_aliases(chunk_font, slug)
                core.update(chunk_font.getBestCmap())
        manifest[slug] = {'source': relative, 'sourceSha256': expected, 'sourceBytes': source.stat().st_size, 'before': before, 'weight': weight, 'outputs': {}}
        if slug.startswith('be-vietnam-pro'):
            specs = json.loads((ROOT / 'scripts/fonts/google-sources.json').read_text())
            for group, part in [('vietnamese', 'vietnamese-core'), ('latin-ext', 'latin-ext-extended'), ('latin', 'latin-core')]:
                spec = next(item for item in specs if item['weight'] == weight and item['group'] == group)
                file = download(cache, spec['url'], spec['sha256'])
                font = TTFont(file, recalcTimestamp=False, recalcBBoxes=False)
                preserve_hyphen_aliases(font, slug)
                target = output / f'{slug}-{part}.woff2'
                font.save(target)
                manifest[slug]['outputs'][part] = {'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes()), 'unicodeRange': unicode_range(font.getBestCmap()), 'sourceUrl': spec['url'], 'sourceSha256': spec['sha256'], **metadata(font)}
            continue
        for part, file in original_chunks:
            target = output / f'{slug}-{part}.woff2'
            chunk_font = TTFont(file, recalcTimestamp=False, recalcBBoxes=False)
            preserve_hyphen_aliases(chunk_font, slug)
            chunk_font.save(target)
            manifest[slug]['outputs'][part] = {'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes()), 'unicodeRange': unicode_range(chunk_font.getBestCmap()), **metadata(chunk_font)}
        if original_chunks:
            original_ext = ROOT / 'apps/colab/src/client/assets/fonts/noto-sans-latin-ext.woff2'
            if digest(original_ext.read_bytes()) != 'be4f6d04a074f3887553c9b1c09e563470f3fe975456a13fc5bf7e20b5612976':
                raise ValueError('Original Google Latin Extended font changed')
            chunk_font = TTFont(original_ext, recalcTimestamp=False, recalcBBoxes=False)
            target = output / 'noto-sans-latin-ext-extended.woff2'
            chunk_font.save(target)
            preferred = set(chunk_font.getBestCmap())
            core.update(preferred)
            manifest[slug]['outputs']['latin-ext-extended'] = {'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes()), 'unicodeRange': unicode_range(preferred), **metadata(TTFont(target))}
        parts = [('extended', characters - core)] if original_chunks else [('core', core), ('extended', characters - core)]
        for part, keep in parts:
            if not keep:
                continue
            font = TTFont(source, recalcTimestamp=False)
            preserve_hyphen_aliases(font, slug)
            if slug == 'jetbrains-mono':
                font.recalcBBoxes = False
            if axes:
                font = instantiateVariableFont(font, axes, inplace=True)
                # Reload instancer output so empty gvar entries are materialized.
                serialized = BytesIO()
                font.save(serialized)
                font = TTFont(BytesIO(serialized.getvalue()), recalcTimestamp=False)
            options = subset.Options()
            options.hinting = slug == 'jetbrains-mono'
            options.layout_features = ['*'] if slug == 'jetbrains-mono' else FEATURES
            options.retain_gids = slug == 'jetbrains-mono'
            options.glyph_names = True
            options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
            options.name_legacy = True
            options.name_languages = ['*']
            worker = subset.Subsetter(options=options)
            worker.populate(unicodes=keep)
            worker.subset(font)
            font.flavor = 'woff2'
            file = output / f'{slug}-{part}.woff2'
            font.save(file, reorderTables=True)
            actual = TTFont(file)
            if set(actual.getBestCmap()) != keep:
                raise ValueError(f'Cmap changed unexpectedly: {file}')
            manifest[slug]['outputs'][part] = {'bytes': file.stat().st_size, 'sha256': digest(file.read_bytes()), 'unicodeRange': unicode_range(keep), **metadata(actual)}
    for family, expected in LICENSES:
        (output / f'OFL-{family}.txt').write_bytes(download(cache, family + '/OFL.txt', expected).read_bytes())
    (output / 'OFL-jetbrains-mono.txt').write_bytes((ROOT / 'apps/web/src/app/[locale]/(marketing)/fonts/OFL-JetBrainsMono.txt').read_bytes())
    header = '/* Generated by scripts/fonts/subset_web_fonts.py. Run by hand; do not edit. */\n\n'
    noto_fallback = fallback('Noto Sans Fallback', '100.54', '27.56', '106.33')
    (styles / 'root.css').write_text(header + face('Noto Sans', 'noto-sans', '100 900', 'block', manifest) + '\n\n' + noto_fallback + '\n\n.web-app-font {\n  /* biome-ignore lint/a11y/useGenericFontNames: Preserve the existing next/font fallback stack. */\n  font-family: "Noto Sans", "Noto Sans Fallback";\n  font-style: normal;\n}\n')
    marketing = [face('Be Vietnam Pro', f'be-vietnam-pro-{weight}', str(weight), 'swap', manifest) for weight in [500, 600, 700, 800]]
    marketing += [fallback('Be Vietnam Pro Fallback', '90.61', '24.01', '110.36'), face('monoFont', 'jetbrains-mono', '100 800', 'swap', manifest), fallback('monoFont Fallback', '77.57', '22.82', '131.49')]
    marketing += ['.web-marketing-fonts {\n  --font-be-vietnam-pro: "Be Vietnam Pro", "Be Vietnam Pro Fallback";\n  --font-jetbrains-mono: "monoFont", "monoFont Fallback";\n}']
    (styles / 'marketing.css').write_text(header + '\n\n'.join(marketing) + '\n')
    branding = [face('Inter', 'inter', '400 700', 'swap', manifest), fallback('Inter Fallback', '90.44', '22.52', '107.12'), face('Noto Sans Branding', 'noto-sans', '100 900', 'swap', manifest), '.web-brand-inter {\n  /* biome-ignore lint/a11y/useGenericFontNames: Preserve the existing next/font fallback stack. */\n  font-family: "Inter", "Inter Fallback";\n  font-style: normal;\n}', '.web-brand-noto {\n  /* biome-ignore lint/a11y/useGenericFontNames: Preserve the existing next/font fallback stack. */\n  font-family: "Noto Sans Branding", "Noto Sans Fallback";\n  font-style: normal;\n}']
    (styles / 'branding.css').write_text(header + '\n\n'.join(branding) + '\n')
    (output / 'manifest.json').write_text(json.dumps({'upstreamRevision': REVISION, 'fonts': manifest}, indent=2) + '\n')
    subprocess.run(['bun', 'x', 'biome', 'format', '--write', str(styles), str(output / 'manifest.json')], cwd=ROOT, check=True)
    print(f'Generated font assets for {len(SOURCES)} families and weights')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path.home() / '.cache/tuturuuu-font-subsets')
    generate(parser.parse_args().cache)
