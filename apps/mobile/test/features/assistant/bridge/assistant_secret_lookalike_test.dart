import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/bridge/assistant_secret_scan.dart';

// Synthetic credential shapes only; none of these are real secrets. They are
// assembled at runtime so repository secret scanners never see a full token
// in the source, while the scanner under test sees the same strings.
final String _projectKey = ['sk-proj-', 'Ab3dEf5hIj7kLm9nOp1qRs3Tu'].join();

/// [value] with U+0301 (combining acute) inserted after every [every]
/// characters.
String _withMarks(String value, {int every = 6}) {
  final buffer = StringBuffer();
  for (var i = 0; i < value.length; i++) {
    buffer.write(value[i]);
    if ((i + 1) % every == 0) buffer.write('́');
  }
  return buffer.toString();
}

void main() {
  const r = redactedFieldValue;

  group('combining marks are stripped in an extra reading', () {
    for (final every in [1, 3, 6]) {
      test('a key with U+0301 every $every characters is redacted', () {
        final marked = _withMarks(_projectKey, every: every);
        for (final input in [
          marked,
          'key $marked here',
          'see ${base64.encode(utf8.encode(marked))}',
        ]) {
          expect(assistantTextContainsSecret(input), isTrue, reason: input);
          expect(redactAssistantSecrets(input), r, reason: input);
        }
      });
    }

    test('precomposed accented letters read as their base letters', () {
      // á, é, ì and ñ precomposed, read back trivially as a, e, i and n.
      const input = 'key sk-proj-áb3déf5hìj7kLm9ñOp1qRs3Tu';
      expect(assistantTextContainsSecret(input), isTrue);
    });
  });

  for (final (name, separator) in [
    ('heavy plus', '➕'),
    ('heavy minus', '➖'),
    ('light horizontal', '─'),
    ('heavy horizontal', '━'),
    ('double horizontal', '═'),
    ('lower one eighth block', '▁'),
    ('middle dot', '·'),
    ('bullet', '•'),
    ('combining short solidus overlay', '̷'),
    ('combining long solidus overlay', '̸'),
  ]) {
    for (final reversed in [false, true]) {
      test('Bearer split by $name, reversed=$reversed, is redacted', () {
        final parts = reversed
            ? ['Lm9nOp1qRs3', 'Ab3dEf5hIj7k']
            : ['Ab3dEf5hIj7k', 'Lm9nOp1qRs3'];
        final secret = 'Bearer ${parts.join(separator)}';
        for (final input in [
          secret,
          '1½ hours; $secret',
          '$secret; 1½ hours',
        ]) {
          expect(assistantTextContainsSecret(input), isTrue, reason: input);
          expect(redactAssistantSecrets(input), r, reason: input);
        }
      });
    }
  }

  for (final reversed in [false, true]) {
    test(
      'GitHub token split by heavy plus, reversed=$reversed, is redacted',
      () {
        final parts = reversed
            ? ['Lm9nOp1qRs3TuVw', 'Ab3dEf5hIj']
            : ['Ab3dEf5hIj', 'Lm9nOp1qRs3TuVw'];
        final input = 'ghp_${parts.join('➕')}';
        expect(assistantTextContainsSecret(input), isTrue, reason: input);
        expect(redactAssistantSecrets(input), r, reason: input);
      },
    );
  }

  test('ordinary text with marks, fractions and shapes stays shareable', () {
    const vietnamese = 'Họp nhóm lúc 9:30 sáng mai ở phòng Trường Sơn';
    final decomposedVietnamese = String.fromCharCodes([
      0x48, 0x6F, 0x323, 0x70, 0x20, // Họp
      0x6E, 0x68, 0x6F, 0x301, 0x6D, 0x20, // nhóm
      0x6C, 0x75, 0x301, 0x63, 0x20, // lúc
      0x56, 0x69, 0x65, 0x302, 0x323, 0x74, // Việt
    ]);
    for (final ordinary in [
      vietnamese,
      decomposedVietnamese,
      '1½ hours',
      '3/4 cup ¾',
      '12⁄10⁄2026',
      '╱╱╱',
      'Open lib/features/assistant/bridge/assistant_screen_context.dart',
      'See https://tuturuuu.com/calendar/weekly-planning-overview?view=week',
      'Agenda • Intro · Demo ─ Q&A ═══ Wrap-up ➕ notes',
    ]) {
      expect(assistantTextContainsSecret(ordinary), isFalse, reason: ordinary);
      expect(redactAssistantSecrets(ordinary), ordinary, reason: ordinary);
    }
  });

  test('unsupported characters still redact the whole field', () {
    for (final input in ['Before ∕ after', 'Before Ж after']) {
      expect(redactAssistantSecrets(input), r, reason: input);
    }
  });
}
