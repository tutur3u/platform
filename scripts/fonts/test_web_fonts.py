"""Validate the committed font files, not a mocked font generator."""
import hashlib
import json
import re
import unittest
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'apps/web/public/fonts/subsets'
STYLES = ROOT / 'apps/web/src/fonts'


def codepoints(value):
    result = set()
    for token in value.split(','):
        ends = token.strip().removeprefix('U+').split('-')
        start, end = int(ends[0], 16), int(ends[-1], 16)
        result.update(range(start, end + 1))
    return result


class WebFonts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ASSETS / 'manifest.json').read_text())['fonts']

    def test_real_outputs_match_declared_bytes_and_ranges(self):
        for name, entry in self.manifest.items():
            coverage = set()
            for part, expected in entry['outputs'].items():
                file = ASSETS / f'{name}-{part}.woff2'
                actual = TTFont(file)
                chars = set(actual.getBestCmap())
                if name in ['jetbrains-mono', 'inter']:
                    self.assertFalse(coverage & chars, name)
                coverage |= chars
                self.assertEqual(chars, codepoints(expected['unicodeRange']))
                self.assertEqual(file.stat().st_size, expected['bytes'])
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), expected['sha256'])
                self.assertEqual(len(actual.getGlyphOrder()), expected['glyphs'])
                self.assertEqual(actual.flavor, 'woff2')

    def test_full_vietnamese_stays_in_each_core_pool(self):
        vietnamese = set(range(0x1EA0, 0x1EFA)) | {0x102, 0x103, 0x110, 0x111, 0x128, 0x129, 0x168, 0x169, 0x1A0, 0x1A1, 0x1AF, 0x1B0, 0x300, 0x301, 0x303, 0x309, 0x323}
        for name in self.manifest:
            core = set().union(*(set(TTFont(ASSETS / f'{name}-{part}.woff2').getBestCmap()) for part in self.manifest[name]['outputs'] if part.endswith('core')))
            self.assertFalse(vietnamese - core, name)
            self.assertTrue(set(range(0x20, 0x7F)) <= core, name)

    def test_no_hinting_in_committed_derivatives(self):
        for file in ASSETS.glob('*.woff2'):
            font = TTFont(file)
            allowed = {'prep'} if file.name.startswith('jetbrains-mono-') else set()
            self.assertFalse((set(font.keys()) & {'fpgm', 'prep', 'cvt ', 'hdmx', 'VDMX', 'LTSH'}) - allowed, file.name)
            if 'glyf' in font:
                for name in font.getGlyphOrder():
                    program = getattr(font['glyf'][name], 'program', None)
                    self.assertFalse(program and program.getBytecode(), (file.name, name))

    def test_original_names_are_allowed_and_licensed(self):
        for file in ASSETS.glob('*.woff2'):
            font = TTFont(file)
            self.assertTrue(font['name'].getDebugName(0))
            self.assertEqual(font['post'].formatType, 2.0)
            self.assertTrue(font['name'].getDebugName(1).startswith(('Noto Sans', 'Be Vietnam Pro', 'JetBrains Mono', 'Inter')))
        for family in ['notosans', 'bevietnampro', 'inter', 'jetbrains-mono']:
            license = (ASSETS / f'OFL-{family}.txt').read_text()
            self.assertIn('SIL OPEN FONT LICENSE Version 1.1', license)
            header = license.split('This Font Software')[0]
            self.assertNotIn('Reserved Font Name', header)

    def test_hyphens_have_real_glyphs_in_display_core(self):
        for weight in [500, 600, 700, 800]:
            font = TTFont(ASSETS / f'be-vietnam-pro-{weight}-latin-core.woff2')
            cmap = font.getBestCmap()
            self.assertEqual(cmap[0x2010], cmap[0x2D])
            self.assertEqual(cmap[0x2011], cmap[0x2D])

    def test_mono_keeps_original_glyph_ids_and_bounds(self):
        original = TTFont(ROOT / 'apps/web/src/app/[locale]/(marketing)/fonts/jetbrains-mono-variable.woff2')
        core = TTFont(ASSETS / 'jetbrains-mono-core.woff2')
        for codepoint, glyph in core.getBestCmap().items():
            expected = original.getBestCmap()[codepoint]
            self.assertEqual(core.getGlyphID(glyph), original.getGlyphID(expected))
        for field in ['xMin', 'xMax', 'yMin', 'yMax']:
            self.assertEqual(getattr(core['head'], field), getattr(original['head'], field))
        self.assertEqual(core['prep'].program.getBytecode(), bytes.fromhex('b801ff85b0048d'))

    def test_css_faces_match_real_cmaps(self):
        for file in STYLES.glob('*.css'):
            ranges = {}
            for block in re.findall(r'@font-face\s*\{([^}]+)\}', file.read_text()):
                source = re.search(r'/fonts/subsets/([^"\)]+)', block)
                if source:
                    chars = set(TTFont(ASSETS / source[1]).getBestCmap())
                    declared = re.search(r'unicode-range:\s*([^;]+)', block)
                    self.assertIsNotNone(declared, file.name)
                    subset = codepoints(declared[1])
                    self.assertTrue(subset <= chars)
                    ranges.setdefault(source[1], set()).update(subset)
            for name, chars in ranges.items():
                actual = set(TTFont(ASSETS / name).getBestCmap())
                self.assertTrue(chars <= actual)
                if name.startswith(('jetbrains-mono-', 'inter-')):
                    self.assertEqual(chars, actual)

    def test_declared_core_ranges_cover_vietnamese(self):
        pools = {name: set() for name in self.manifest}
        for file in STYLES.glob('*.css'):
            for block in re.findall(r'@font-face\s*\{([^}]+)\}', file.read_text()):
                source = re.search(r'/fonts/subsets/([^"\)]+)', block)
                if not source or not source[1].endswith('-core.woff2'):
                    continue
                declared = re.search(r'unicode-range:\s*([^;]+)', block)
                name = next(name for name in pools if source[1].startswith(name + '-'))
                pools[name].update(codepoints(declared[1]))
        for name, chars in pools.items():
            self.assertTrue(set(range(0x1EA0, 0x1EFA)) <= chars, name)

    def test_root_stack_is_shared_by_public_and_dashboard(self):
        root = ROOT / 'apps/web/src/app/[locale]'
        layout = (root / 'layout.tsx').read_text()
        self.assertIn("import '@/fonts/root.css'", layout)
        self.assertIn("'web-app-font'", layout)
        self.assertIn('<body', layout)
        self.assertIn('font-family: "Noto Sans", "Noto Sans Fallback";', (STYLES / 'root.css').read_text())
        for group in ['(marketing)', '(dashboard)']:
            source = (root / group / 'layout.tsx').read_text()
            self.assertNotIn('<body', source)
            self.assertNotIn('<html', source)
        self.assertNotIn('next/font', layout)
        self.assertNotIn('common/nextjs', layout)


if __name__ == '__main__':
    unittest.main()
