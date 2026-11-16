"""Writes apps/mobile/lib/core/theme/sorbet/sorbet_palettes.dart.

The default roles and hues come from packages/ui/src/sorbet-tokens.json and
the preset source colours and High Contrast inks from
packages/ui/src/sorbet-presets.css. Run from anywhere, then format:

    python3 apps/mobile/tool/generate_sorbet_palettes.py
    dart format apps/mobile/lib/core/theme/sorbet/sorbet_palettes.dart
"""

import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
tokens_path = sys.argv[1] if len(sys.argv) > 1 else root / 'packages/ui/src/sorbet-tokens.json'
target = root / 'apps/mobile/lib/core/theme/sorbet/sorbet_palettes.dart'
tokens = json.load(open(tokens_path))
presets = open(f'{root}/packages/ui/src/sorbet-presets.css').read()
presets = re.sub(r'/\*.*?\*/', '', presets, flags=re.S)

order = ['sorbet','matcha','blueberry','mango','lavender','lagoon','rose','graphite','midnight','high-contrast']
hue_names = ['blue','green','orange','red','yellow','purple','pink','teal','gray']
src = {}; hc_inks = {}
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', presets):
    sel = ' '.join(m.group(1).split())
    d = {k.removeprefix('sorbet-'): v for k, v in re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;', m.group(2))}
    mm = re.search(r'\[data-sorbet-preview="([\w-]+)"\](\[data-sorbet-preview-mode="dark"\])?', sel)
    if not mm or 'ground' not in d: continue
    mode = 'dark' if mm.group(2) else 'light'
    src[(mm.group(1), mode)] = d
    if mm.group(1) == 'high-contrast': hc_inks[mode] = [d[k] for k in hue_names]

def c(v):
    v = v.strip()
    if v.startswith('#'): return f'Color(0xFF{v[1:].upper()})'
    r, g, b, a = [x.strip() for x in re.match(r'rgba\(([^)]*)\)', v).group(1).split(',')]
    return f'Color.fromRGBO({r}, {g}, {b}, {a})'
def camel(s):
    p = s.split('-'); return p[0] + ''.join(x.title() for x in p[1:])
src_keys = ['ground','surface','card','ink','muted-ink','hairline','input','accent','accent-ink','accent-soft','ring']
role_keys = list(tokens['color']['light'].keys())
out = []; w = out.append
w("""// Sorbet colour data. Generated from packages/ui/src/sorbet-tokens.json
// (default roles and hues) and packages/ui/src/sorbet-presets.css (preset
// source colours and the High Contrast inks) by\n// apps/mobile/tool/generate_sorbet_palettes.py; regenerate rather than edit.
// test/core/theme/sorbet/sorbet_palette_parity_test.dart fails on drift.

import 'dart:ui';

import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Sorbet colour data per preset and mode.
abstract final class SorbetPalettes {
  static SorbetSourceColors source(SorbetPreset preset, Brightness b) =>
      (b == Brightness.dark ? _darkSources : _lightSources)[preset]!;

  /// The default palette's roles (`color.<mode>` in sorbet-tokens.json).
  static SorbetRoles defaultRoles(Brightness b) =>
      b == Brightness.dark ? _darkRoles : _lightRoles;

  /// Roles of [preset]; Sorbet itself uses the default palette.
  static SorbetRoles roles(SorbetPreset preset, Brightness b) {
    if (preset == SorbetPreset.sorbet) return defaultRoles(b);
    final base = defaultRoles(b);
    return SorbetRoles.fromSource(
      source(preset, b),
      b,
      destructive: base.destructive,
      destructiveForeground: base.destructiveForeground,
    );
  }

  /// Hues; High Contrast swaps in stronger inks.
  static SorbetHues hues(SorbetPreset preset, Brightness b) {
    final dark = b == Brightness.dark;
    final hues = dark ? _darkHues : _lightHues;
    if (preset != SorbetPreset.highContrast) return hues;
    return hues.withInks(dark ? _highContrastDarkInks : _highContrastLightInks);
  }
""")
for mode in ['light','dark']:
    w(f"\n  static const _{mode}Sources = <SorbetPreset, SorbetSourceColors>{{")
    for p in order:
        d = src[(p, mode)]
        w(f"    SorbetPreset.{camel(p)}: SorbetSourceColors(")
        for k in src_keys: w(f"      {camel(k)}: {c(d[k])},")
        w("    ),")
    w("  };")
for mode in ['light','dark']:
    w(f"\n  static const _{mode}Roles = SorbetRoles(")
    for k in role_keys: w(f"    {camel(k)}: {c(tokens['color'][mode][k])},")
    w("  );")
for mode in ['light','dark']:
    w(f"\n  static const _{mode}Hues = SorbetHues(")
    for h in hue_names:
        v = tokens['hues'][h][mode]
        w(f"    {h}: SorbetHue(fill: {c(v['fill'])}, calm: {c(v['calm'])}, ink: {c(v['ink'])}),")
    w("  );")
for mode in ['light','dark']:
    w(f"\n  // {', '.join(hue_names)}.")
    w(f"  static const _highContrast{mode.title()}Inks = <Color>[")
    for v in hc_inks[mode]: w(f"    {c(v)},")
    w("  ];")
w("}")
target.write_text('\n'.join(out) + '\n')
