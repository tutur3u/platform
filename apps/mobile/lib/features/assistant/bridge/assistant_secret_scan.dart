import 'dart:math' as math;

import 'package:mobile/features/assistant/bridge/assistant_secret_normalize.dart';

const redactedFieldValue = '[redacted]';

/// Only this much of a value is scanned: shared values are cut to a few
/// hundred characters, and the margin keeps any secret overlapping the cut
/// inside the scanned text.
const assistantSecretScanLimit = 8192;
const _maxDecodeDepth = 3;

// Well-known credential shapes.
final _credentialPatterns = <RegExp>[
  RegExp(
    r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?'
    r'(?:-----END [A-Z ]*PRIVATE KEY-----|$)',
  ),
  // JSON Web Tokens.
  RegExp(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'),
  RegExp(r'\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}'),
  RegExp(r'\bsk-[A-Za-z0-9_-]{16,}'),
  RegExp(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'),
  RegExp(r'\bxox[abposr]-[A-Za-z0-9-]{10,}'),
  RegExp(r'\b(?:AKIA|ASIA)[0-9A-Z]{16}\b'),
  RegExp(r'\bAIza[0-9A-Za-z_-]{35}'),
  RegExp(r'\bglpat-[A-Za-z0-9_-]{20,}'),
  RegExp(r'\bBearer\s+[A-Za-z0-9._~+/=-]{16,}', caseSensitive: false),
];

final _cardCandidate = RegExp(r'(?<!\d)\d(?:[ .-]?\d){12,18}(?!\d)');
final _ibanCandidate = RegExp(r'\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b');
final _tokenCandidate = RegExp(r'[A-Za-z0-9_\-+/=.]{24,}');

/// Whether [value] holds a secret in any representation a reader could
/// recover. Every reading is folded (invisible characters, Unicode spaces,
/// fullwidth and superscript forms) and must contain only supported
/// characters; the raw value and each decoded reading (percent, escape,
/// base64 and hex, up to three layers) are checked the same way. Fails closed
/// (returns true) on any unsupported character in any reading, and on an
/// encoding still decodable at the depth limit.
bool assistantTextContainsSecret(
  String value, {
  int scanLimit = assistantSecretScanLimit,
}) {
  final scanned = value.length > scanLimit
      ? value.substring(0, scanLimit)
      : value;
  final seen = <String>{};
  var layer = [foldAssistantText(scanned)];
  for (var depth = 0; layer.isNotEmpty; depth++) {
    final next = <String>[];
    for (final text in layer) {
      if (!seen.add(text)) continue;
      if (!isSupportedAssistantText(text) || _matchesSecret(text)) return true;
      final decoded = assistantTextDecodings(text).toList();
      if (decoded.isEmpty) continue;
      // Residual encoding past the bound is treated as a secret rather than
      // decoded further without limit.
      if (depth == _maxDecodeDepth) return true;
      next.addAll(decoded.map(foldAssistantText));
    }
    layer = next;
  }
  return false;
}

/// Returns [value] unchanged, or [redactedFieldValue] for the whole value when
/// it contains a secret. Partial redaction is not attempted because a match in
/// a decoded or folded reading cannot be mapped back to the original safely.
String redactAssistantSecrets(String value) =>
    assistantTextContainsSecret(value) ? redactedFieldValue : value;

bool _matchesSecret(String text) =>
    _credentialPatterns.any((pattern) => pattern.hasMatch(text)) ||
    _cardCandidate.allMatches(text).any((m) => _isLuhnValid(m[0]!)) ||
    _ibanCandidate.allMatches(text).any((m) => _isValidIban(m[0]!)) ||
    _tokenCandidate.allMatches(text).any((m) => _looksLikeToken(m[0]!));

bool _isLuhnValid(String candidate) {
  final digits = candidate.replaceAll(RegExp('[ .-]'), '');
  if (digits.length < 13 || digits.length > 19) return false;
  var sum = 0;
  for (var i = 0; i < digits.length; i++) {
    var digit = digits.codeUnitAt(digits.length - 1 - i) - 48;
    if (i.isOdd) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 == 0;
}

bool _isValidIban(String candidate) {
  final iban = candidate.replaceAll(' ', '');
  if (iban.length < 15 || iban.length > 34) return false;
  final rearranged = iban.substring(4) + iban.substring(0, 4);
  var remainder = 0;
  for (final unit in rearranged.codeUnits) {
    final value = unit >= 65 ? unit - 55 : unit - 48;
    for (final digit in value.toString().codeUnits) {
      remainder = (remainder * 10 + digit - 48) % 97;
    }
  }
  return remainder == 1;
}

/// Long runs mixing letters with digits, or upper with lower case (base64
/// without digits), that have high character entropy.
bool _looksLikeToken(String candidate) {
  final hasDigit = candidate.contains(RegExp('[0-9]'));
  final hasUpper = candidate.contains(RegExp('[A-Z]'));
  final hasLower = candidate.contains(RegExp('[a-z]'));
  if (!(hasUpper || hasLower)) return false;
  if (!hasDigit && !(hasUpper && hasLower)) return false;
  final counts = <int, int>{};
  for (final unit in candidate.codeUnits) {
    counts[unit] = (counts[unit] ?? 0) + 1;
  }
  var entropy = 0.0;
  for (final count in counts.values) {
    final p = count / candidate.length;
    entropy -= p * math.log(p) / math.ln2;
  }
  return entropy >= 3.5;
}
