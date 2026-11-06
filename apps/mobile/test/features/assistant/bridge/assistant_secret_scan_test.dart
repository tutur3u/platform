import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/bridge/assistant_secret_compat_fold.g.dart';
import 'package:mobile/features/assistant/bridge/assistant_secret_scan.dart';

// Synthetic credential shapes only; none of these are real secrets. They are
// assembled at runtime so repository secret scanners never see a full token
// in the source, while the scanner under test sees the same strings.
String _fake(String prefix, String body) => '$prefix$body';

final String _key = _fake('sk-', 'abcdefghijklmnop1234');
const _vietnamese =
    'Họp nhóm lúc 9:30 sáng mai, gọi 0901234567, xem '
    'https://tuturuuu.com/calendar/weekly-planning-overview';

/// Standard percent-encoding of the UTF-8 bytes.
String _utf8Percent(String value) => utf8
    .encode(value)
    .map((byte) => '%${byte.toRadixString(16).padLeft(2, '0').toUpperCase()}')
    .join();

/// Four groups of four Arabic-Indic digits spelling a Luhn-valid card.
final String _arabicIndicCard = List.filled(
  4,
  String.fromCharCodes([0x664, 0x662, 0x664, 0x662]),
).join(' ');

final String _priceNote =
    'Wait${String.fromCharCode(0x2026)} the price is '
    '50.000${String.fromCharCode(0x20AB)}';

String _percent(String value) => value.codeUnits
    .map((unit) => '%${unit.toRadixString(16).padLeft(2, '0').toUpperCase()}')
    .join();

void main() {
  const r = redactedFieldValue;

  test('redacts the whole value for credential shapes in ordinary text', () {
    final jwt = [
      _fake('eyJ', 'hbGciOiJIUzI1NiJ9'),
      _fake('eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0'),
      'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ].join('.');
    for (final input in [
      'call me, token $jwt thanks',
      'key ${_fake('sk-proj-', 'abcdefghijklmnop1234')} here',
      'stripe ${_fake('sk_live_', '51HabcdefGHIJ12345')}',
      'gh ${_fake('ghp_', '0123456789abcdefghijABCDEFGHIJ')}',
      'aws ${_fake('AKIA', 'IOSFODNN7EXAMPLE')} end',
      'Authorization: ${_fake('Bearer ', 'abc.def-ghi_jkl012345')}',
    ]) {
      expect(redactAssistantSecrets(input), r, reason: input);
    }
  });

  test('redacts Luhn-valid cards and valid IBANs only', () {
    expect(redactAssistantSecrets('card 4242 4242 4242 4242 exp 12/30'), r);
    expect(
      redactAssistantSecrets('ref 1234 5678 9012 3456'),
      'ref 1234 5678 9012 3456',
    );
    expect(redactAssistantSecrets('IBAN DE89 3704 0044 0532 0130 00 pls'), r);
    expect(
      redactAssistantSecrets('code DE00 1234 5678 9012 3456 78'),
      'code DE00 1234 5678 9012 3456 78',
    );
  });

  test('redacts long high-entropy tokens but keeps ordinary text', () {
    expect(
      redactAssistantSecrets(
        'secret: ${_fake('q8Zr2LmX9vT4bN7p', 'K1sW6yH3dF0gJ5c')}',
      ),
      r,
    );
    for (final ordinary in [
      _vietnamese,
      'Bring\tslides\u00A0and notes; 50% of the budget is left.',
      'Weekly sync 2026-10-25 09:00 to 09:30, room 4B (20 m²).',
    ]) {
      expect(redactAssistantSecrets(ordinary), ordinary, reason: ordinary);
    }
  });

  test('normalizes separators, invisible and fullwidth characters', () {
    for (final input in [
      'card 4242\t4242\t4242\t4242',
      'card 4242\u00A04242\u00A04242\u00A04242',
      'card 4242\u3000\u30004242 4242 4242',
      'card ４２４２ ４２４２ ４２４２ ４２４２',
      'key sk-abcdefgh\u200Bijklmnop\u200D1234',
      'key ｓｋ－ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐ１２３４',
      'card ⁴²⁴² ⁴²⁴² ₄₂₄₂ ₄₂₄₂',
    ]) {
      expect(assistantTextContainsSecret(input), isTrue, reason: input);
    }
  });

  test('decodes percent, escape, base64 and hex encodings', () {
    final encoded = [
      'see ${_percent(_key)}',
      'see ${_percent(_percent(_key))}',
      'see ${_key.codeUnits.map((u) => '\\x${u.toRadixString(16)}').join()}',
      'see ${_key.codeUnits.map((u) => '&#$u;').join()}',
      'see ${base64.encode(utf8.encode(_key))}',
      'see ${base64Url.encode(utf8.encode('card 4242 4242 4242 4242'))}',
      'see ${utf8.encode(_key).map((b) => b.toRadixString(16)).join()}',
    ];
    for (final input in encoded) {
      expect(assistantTextContainsSecret(input), isTrue, reason: input);
    }
  });

  test('treats digit-free mixed-case base64 as a token', () {
    expect(
      assistantTextContainsSecret('auth QWxhZGRpbjpvcGVuIHNlc2FtZQ=='),
      isTrue,
    );
  });

  test('fails closed on compatibility characters it cannot fold', () {
    for (final input in [
      'card 𝟒𝟐𝟒𝟐 𝟒𝟐𝟒𝟐 𝟒𝟐𝟒𝟐 𝟒𝟐𝟒𝟐',
      'pin ٤٢٤٢',
      'code ①②③④',
    ]) {
      expect(assistantTextContainsSecret(input), isTrue, reason: input);
    }
  });

  test('scans only a bounded prefix of very long values', () {
    final long = '${'a ' * (assistantSecretScanLimit ~/ 2)}$_key';
    expect(assistantTextContainsSecret(long), isFalse);
    expect(assistantTextContainsSecret('${'a ' * 200}$_key'), isTrue);
  });

  test('only supported characters pass, in every decoded reading', () {
    for (final input in [
      // Long s reads back as s.
      '${String.fromCharCode(0x17F)}k-abcdefghijklmnop1234',
      // Unsupported digits hidden behind standard UTF-8 percent-encoding.
      'card ${_utf8Percent(_arabicIndicCard)}',
      'card ${base64.encode(utf8.encode(_arabicIndicCard))}',
      // Another script's look-alike letters.
      '${String.fromCharCodes([0x455, 0x43A])}-abcdefghijklmnop1234',
      // An encoding still decodable at the depth limit.
      'see ${_percent(_percent(_percent(_percent(_key))))}',
    ]) {
      expect(assistantTextContainsSecret(input), isTrue, reason: input);
    }
    for (final ordinary in [
      'Great job ${String.fromCharCode(0x1F389)} see you at 9',
      _priceNote,
      'Café crème, naïve résumé',
    ]) {
      expect(assistantTextContainsSecret(ordinary), isFalse, reason: ordinary);
    }
  });

  test('ordinary vulgar fractions remain shareable', () {
    const ordinary = '1½ hours';
    expect(assistantTextContainsSecret(ordinary), isFalse);
    expect(redactAssistantSecrets(ordinary), ordinary);
  });

  for (final (name, separator) in [
    ('fraction slash', '\u2044'),
    ('vulgar fraction', '½'),
    ('box diagonal', '\u2571'),
    ('heavy solidus', '\u{1F67C}'),
    ('fullwidth slash', '\uFF0F'),
  ]) {
    for (final reversed in [false, true]) {
      test('embedded $name credential, reversed=$reversed, is redacted', () {
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

  test('other unsupported characters still redact the entire field', () {
    for (final unsupported in [
      '\u2215', // division slash
      '\u27CB', // mathematical rising diagonal
      '\u29F8', // big solidus
      '\u0416', // Cyrillic letter
      '\u0664', // Arabic-Indic digit
    ]) {
      for (final value in [unsupported, _utf8Percent(unsupported)]) {
        final input = 'Before $value after, 1½ hours';
        expect(assistantTextContainsSecret(input), isTrue, reason: input);
        expect(redactAssistantSecrets(input), r, reason: input);
      }
    }
  });

  test('a real secret beside a vulgar fraction is still detected', () {
    expect(assistantTextContainsSecret('1½ hours $_key'), isTrue);
    expect(assistantTextContainsSecret('$_key 1½ hours'), isTrue);
  });

  test('folds supported characters with an ASCII compatibility reading', () {
    final rupee = String.fromCharCode(0x20A8);
    final split = 'sk-abcdefghijklmn${rupee}1234';
    expect(assistantCompatibilityFolds[0x20A8], 'Rs');
    for (final input in [
      split,
      'see ${_utf8Percent(split)}',
      'see ${base64.encode(utf8.encode(split))}',
    ]) {
      expect(assistantTextContainsSecret(input), isTrue, reason: input);
    }
    final lunch = '${rupee}250 for lunch';
    expect(assistantTextContainsSecret(lunch), isFalse);
    expect(redactAssistantSecrets(lunch), lunch);
  });
}
