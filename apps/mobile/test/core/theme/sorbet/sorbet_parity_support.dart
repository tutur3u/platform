import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

/// The shared web sources the Dart mirror must match.
Directory sorbetUiSource() {
  var dir = Directory.current.absolute;
  while (true) {
    final candidate = Directory('${dir.path}/packages/ui/src');
    if (File('${candidate.path}/sorbet.css').existsSync()) return candidate;
    final parent = dir.parent;
    if (parent.path == dir.path) {
      fail('packages/ui/src/sorbet.css not found above ${Directory.current}');
    }
    dir = parent;
  }
}

/// CSS rule blocks as selector → custom properties, comments removed.
/// Nested at-rule wrappers are skipped; their inner rules still parse.
Map<String, Map<String, String>> sorbetCssBlocks(String css) {
  final clean = css.replaceAll(RegExp(r'/\*.*?\*/', dotAll: true), '');
  final result = <String, Map<String, String>>{};
  for (final m in RegExp(r'([^{}]+)\{([^{}]*)\}').allMatches(clean)) {
    final selector = m.group(1)!.split(RegExp(r'\s+')).join(' ').trim();
    // A selector repeated later (for example inside a media query) only
    // adds properties; the first declaration of each one stands.
    final block = result.putIfAbsent(selector, () => {});
    for (final d in RegExp(r'--([\w-]+):\s*([^;]+);').allMatches(m.group(2)!)) {
      block.putIfAbsent(d.group(1)!, () => d.group(2)!.trim());
    }
  }
  return result;
}

Color _css(String value) {
  final hex = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(value);
  if (hex != null) return Color(0xFF000000 | int.parse(hex[1]!, radix: 16));
  final rgba = RegExp(r'^rgba\(([^)]*)\)$').firstMatch(value);
  if (rgba == null) fail('Unsupported colour "$value"');
  final parts = rgba[1]!.split(',').map((p) => p.trim()).toList();
  return Color.fromRGBO(
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
    double.parse(parts[3]),
  );
}

String _hex(Color c) =>
    '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}'
    '${c.a < 1 ? ' @${c.a.toStringAsFixed(3)}' : ''}';

/// Same RGB, and alpha within one 8-bit step.
void expectSorbetColor(Color actual, String css, String where) {
  final expected = _css(css);
  final same =
      (actual.toARGB32() & 0xFFFFFF) == (expected.toARGB32() & 0xFFFFFF) &&
      (actual.a - expected.a).abs() <= 1 / 255 + 1e-9;
  expect(
    same,
    isTrue,
    reason:
        'Sorbet drift at $where: Dart ${_hex(actual)}, web $css. '
        'Regenerate sorbet_palettes.dart with '
        'apps/mobile/tool/generate_sorbet_palettes.py.',
  );
}

/// The parsed `sorbet-tokens.json` contract.
Map<String, dynamic> sorbetTokensJson() =>
    jsonDecode(
          File(
            '${sorbetUiSource().path}/sorbet-tokens.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;
