import 'dart:convert';

import 'package:mobile/features/assistant/bridge/assistant_secret_compat_fold.g.dart';

// Dart has no built-in NFKC. Rather than claim full compatibility coverage,
// this folds forms a person reads back trivially (fullwidth ASCII,
// superscript and subscript digits, Unicode spaces and dashes, the ellipsis)
// plus every supported character whose NFKC reading contains an ASCII letter
// or digit (a table generated from the supported ranges), then accepts only a
// conservative set of supported characters. Text with any other character
// fails closed, so callers redact it.

final _formatChars = RegExp(r'[\p{Cf}\u034F\uFE00-\uFE0F]', unicode: true);
final _whitespace = RegExp(r'\s+');
final _marks = RegExp(r'\p{Mn}', unicode: true);

/// Look-alikes of the punctuation credentials are spelled with
/// (`+ - _ = . /`), each mapped to the ASCII character it reads as. A secret
/// split by one of them reads back as one token, so it is scanned as one.
/// Covers dashes and the supported shapes, dingbats and emoji that are drawn
/// as a single bar, cross, dot or diagonal.
final _punctuationLookAlikes = <(RegExp, String)>[
  (
    RegExp(
      r'[\u2795\u2719-\u271C\u{1F7A1}-\u{1F7A7}]', // heavy plus, crosses
      unicode: true,
    ),
    '+',
  ),
  (
    RegExp(
      // Dashes, minus signs, heavy minus and the horizontal box-drawing bars.
      r'[\u2010-\u2015\u2212\uFE58\uFE63\u2796\u2500\u2501\u2504'
      r'\u2505\u2508\u2509\u254C\u254D\u2574\u2576\u2578\u257A\u257C'
      r'\u257E]',
      unicode: true,
    ),
    '-',
  ),
  (RegExp(r'[\u2017\u2581]', unicode: true), '_'), // double low line, block
  (RegExp(r'[\u2550\u268C]', unicode: true), '='), // double horizontals
  (
    RegExp(r'[\u00B7\u2022\u25CF\u25E6]', unicode: true), // dots, bullets
    '.',
  ),
  (RegExp(r'[\u2044\u2571\u{1F67C}]', unicode: true), '/'), // diagonals
];

/// Characters screen context may share after folding: ASCII, Latin letters
/// and marks used by English and Vietnamese (and other Latin-script
/// languages), common punctuation, currency, arrows, shapes and emoji.
/// Everything else, including other scripts, fails closed. After changing
/// these ranges, regenerate the fold table with
/// `node tool/generate_assistant_compat_fold.mjs` (`--check` verifies it).
const _supportedRanges = <(int, int)>[
  (0x09, 0x0A),
  (0x0D, 0x0D),
  (0x20, 0x7E),
  (0xA0, 0xFF), // Latin-1 Supplement
  (0x100, 0x24F), // Latin Extended-A and -B
  (0x300, 0x36F), // combining diacritics (Vietnamese NFD)
  (0x1E00, 0x1EFF), // Latin Extended Additional (Vietnamese)
  (0x2016, 0x2023), // quotes, daggers, bullets
  (0x2030, 0x2030),
  (0x2039, 0x203A),
  (0x20A0, 0x20C0), // currency, including the dong sign
  (0x2190, 0x21FF), // arrows
  (0x2500, 0x27BF), // box drawing, shapes, symbols, dingbats
  (0x1F1E6, 0x1F1FF), // regional indicators (flags)
  (0x1F300, 0x1FAFF), // emoji
];

/// Look-alikes with no compatibility mapping that still read as ASCII letters.
/// Characters with an ASCII compatibility reading are folded instead (see
/// [assistantCompatibilityFolds]).
const _lookAlikes = {0x131, 0x237}; // dotless i and j

bool _isSupported(int rune) {
  if (_lookAlikes.contains(rune)) return false;
  for (final (start, end) in _supportedRanges) {
    if (rune >= start && rune <= end) return true;
  }
  return false;
}

/// Whether every character of folded [value] is in the supported set.
bool isSupportedAssistantText(String value) => value.runes.every(_isSupported);

/// Strips invisible format characters; folds supported characters with an
/// ASCII compatibility reading, fullwidth ASCII, superscript and subscript
/// digits, look-alikes of credential punctuation and the ellipsis; and
/// collapses every whitespace run (tab, NBSP, ideographic space) to one ASCII
/// space.
String foldAssistantText(String value) {
  final buffer = StringBuffer();
  for (final rune in value.replaceAll(_formatChars, '').runes) {
    final compatibility = assistantCompatibilityFolds[rune];
    if (compatibility != null) {
      buffer.write(compatibility);
    } else if (rune >= 0xFF01 && rune <= 0xFF5E) {
      buffer.writeCharCode(rune - 0xFEE0);
    } else if (rune == 0x2070) {
      buffer.write('0');
    } else if (rune >= 0x2074 && rune <= 0x2079) {
      buffer.writeCharCode(0x30 + rune - 0x2070);
    } else if (rune >= 0x2080 && rune <= 0x2089) {
      buffer.writeCharCode(0x30 + rune - 0x2080);
    } else if (rune == 0x2026) {
      buffer.write('...');
    } else {
      buffer.writeCharCode(rune);
    }
  }
  var folded = buffer.toString();
  for (final (lookAlikes, ascii) in _punctuationLookAlikes) {
    folded = folded.replaceAll(lookAlikes, ascii);
  }
  return folded.replaceAll(_whitespace, ' ');
}

/// [value] read without diacritics, as NFD with every nonspacing mark
/// removed: precomposed letters become their base letters and lone combining
/// marks (accents, overlays) disappear. Decomposed Vietnamese is supported
/// text, so marks inserted between a secret's characters must not hide it.
String stripAssistantMarks(String value) {
  final buffer = StringBuffer();
  for (final rune in value.runes) {
    final base = assistantMarkStrippedBases[rune];
    if (base != null) {
      buffer.write(base);
    } else {
      buffer.writeCharCode(rune);
    }
  }
  return buffer.toString().replaceAll(_marks, '');
}

final _percent = RegExp('%[0-9A-Fa-f]{2}');
final _escape = RegExp(
  r'\\x([0-9A-Fa-f]{2})|\\u([0-9A-Fa-f]{4})|&#[xX]([0-9A-Fa-f]{1,6});|'
  '&#([0-9]{1,7});',
);
final _base64Run = RegExp('[A-Za-z0-9+/_-]{16,}={0,2}');
final _hexRun = RegExp('(?:[0-9A-Fa-f]{2}){12,}');

/// Decoded readings of the obvious encodings in [value]: percent-encoding,
/// `\x`, `\u` and HTML numeric escapes, and base64 or hex runs that decode to
/// mostly printable text. Each reading replaces the encoded runs in place.
Iterable<String> assistantTextDecodings(String value) sync* {
  if (_percent.hasMatch(value)) yield _percentDecode(value);
  if (_escape.hasMatch(value)) {
    yield value.replaceAllMapped(_escape, (match) {
      final hex = match[1] ?? match[2] ?? match[3];
      final code = hex != null
          ? int.parse(hex, radix: 16)
          : int.parse(match[4]!);
      return code <= 0x10FFFF ? String.fromCharCode(code) : match[0]!;
    });
  }
  final base64 = value.replaceAllMapped(
    _base64Run,
    (match) => _decodeBase64(match[0]!) ?? match[0]!,
  );
  if (base64 != value) yield base64;
  final hex = value.replaceAllMapped(
    _hexRun,
    (match) => _printable(_hexBytes(match[0]!)) ?? match[0]!,
  );
  if (hex != value) yield hex;
}

String _percentDecode(String value) {
  final bytes = <int>[];
  for (var i = 0; i < value.length; i++) {
    final unit = value.codeUnitAt(i);
    if (unit == 0x25 && i + 2 < value.length) {
      final byte = int.tryParse(value.substring(i + 1, i + 3), radix: 16);
      if (byte != null) {
        bytes.add(byte);
        i += 2;
        continue;
      }
    }
    bytes.addAll(utf8.encode(String.fromCharCode(unit)));
  }
  return utf8.decode(bytes, allowMalformed: true);
}

String? _decodeBase64(String run) {
  var text = run.replaceAll('-', '+').replaceAll('_', '/').replaceAll('=', '');
  if (text.length % 4 == 1) return null;
  text = text.padRight((text.length + 3) ~/ 4 * 4, '=');
  try {
    return _printable(base64.decode(text));
  } on FormatException {
    return null;
  }
}

List<int> _hexBytes(String run) => [
  for (var i = 0; i + 1 < run.length; i += 2)
    int.parse(run.substring(i, i + 2), radix: 16),
];

/// The bytes as text when they are valid UTF-8 and at least 90% of the
/// characters are not control characters.
String? _printable(List<int> bytes) {
  if (bytes.isEmpty) return null;
  final String text;
  try {
    // Strictly valid UTF-8 only: random bytes rarely are, while encoded text,
    // including non-ASCII text, always is.
    text = utf8.decode(bytes);
  } on FormatException {
    return null;
  }
  final runes = text.runes.toList();
  final visible = runes.where((r) => r >= 0x20 && r != 0x7F).length;
  return visible >= runes.length * 0.9 ? text : null;
}
