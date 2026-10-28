import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

OutboxEntry _entry({
  int? optionIndex = 0,
  String? text,
  DateTime? createdAt,
  String key = '11111111-1111-4111-8111-111111111111',
}) => OutboxEntry(
  idempotencyKey: key,
  itemId: inboxItemId(1),
  versionHash: inboxHash('a'),
  createdAt: createdAt ?? DateTime.utc(2026, 1, 31, 17),
  optionIndex: text == null ? optionIndex : null,
  optionLabel: text == null ? 'Approve' : null,
  text: text,
);

void main() {
  group('Idempotency-Key', () {
    test('is a lowercase version 4 UUID', () {
      final key = newReplyIdempotencyKey(Random(1));
      expect(
        RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-'
          r'[0-9a-f]{12}$',
        ).hasMatch(key),
        isTrue,
        reason: key,
      );
    });

    test('differs between replies', () {
      final random = Random(2);
      final keys = {
        for (var i = 0; i < 50; i++) newReplyIdempotencyKey(random),
      };
      expect(keys, hasLength(50));
    });

    test('defaults to the secure generator', () {
      expect(newReplyIdempotencyKey(), isNot(newReplyIdempotencyKey()));
    });
  });

  group('request body', () {
    test('an option reply is exactly the closed contract, nothing extra', () {
      expect(_entry(optionIndex: 3).toRequestJson(), {
        'schema_version': '1.4',
        'item_id': inboxItemId(1),
        'version_hash': inboxHash('a'),
        'option_index': 3,
      });
    });

    test('a text reply carries text and no option_index', () {
      expect(_entry(text: 'Ship it, thanks.').toRequestJson(), {
        'schema_version': '1.4',
        'item_id': inboxItemId(1),
        'version_hash': inboxHash('a'),
        'text': 'Ship it, thanks.',
      });
    });

    test('never carries the display label or the key', () {
      final json = _entry().toRequestJson();
      expect(json.keys, isNot(contains('option_label')));
      expect(json.keys, isNot(contains('key')));
    });
  });

  group('stored form', () {
    test('round-trips an option and a text reply', () {
      for (final entry in [_entry(), _entry(text: 'Hello there')]) {
        final back = OutboxEntry.fromStoredJson(entry.toStoredJson())!;
        expect(back.toStoredJson(), entry.toStoredJson());
        expect(back.idempotencyKey, entry.idempotencyKey);
      }
    });

    test('rejects anything off-shape instead of repairing it', () {
      final good = _entry().toStoredJson();
      final bad = <Map<String, Object?>>[
        {...good, 'key': 'not-a-uuid'},
        {...good, 'item_id': 'item-123'},
        {...good, 'version_hash': 'abc'},
        {...good, 'status': 'done'},
        {...good, 'created_at': 'yesterday'},
        {...good, 'option_index': 9},
        {...good, 'option_index': -1},
        {...good, 'text': 'both'},
        {...good, 'option_label': 'x' * 201},
        {...good}..remove('option_index'),
      ];
      for (final json in bad) {
        expect(OutboxEntry.fromStoredJson(json), isNull, reason: '$json');
      }
      expect(OutboxEntry.fromStoredJson('nope'), isNull);
    });

    test('rejects over-long or blank stored text', () {
      final text = _entry(text: 'ok').toStoredJson();
      expect(OutboxEntry.fromStoredJson({...text, 'text': 'x' * 501}), isNull);
      expect(OutboxEntry.fromStoredJson({...text, 'text': '   '}), isNull);
    });
  });

  group('reply text', () {
    test('is non-blank and at most 500 code points', () {
      expect(isValidReplyText(''), isFalse);
      expect(isValidReplyText('   \n'), isFalse);
      expect(isValidReplyText('a' * 500), isTrue);
      expect(isValidReplyText('a' * 501), isFalse);
    });

    group('line limit', () {
      String lines(int count, String separator) =>
          List.filled(count, 'x').join(separator);

      for (final (name, separator) in [
        ('LF', '\n'),
        ('CRLF', '\r\n'),
        ('a lone CR', '\r'),
      ]) {
        test('allows ten lines and refuses eleven with $name', () {
          expect(isValidReplyText(lines(10, separator)), isTrue);
          expect(isValidReplyText(lines(11, separator)), isFalse);
        });
      }

      test('does not count a trailing line break or blank edges', () {
        expect(isValidReplyText('${lines(10, '\n')}\r\n'), isTrue);
        expect(isValidReplyText('\n\n${lines(10, '\n')}'), isTrue);
      });

      test('counts blank lines in the middle', () {
        expect(isValidReplyText('a${'\n' * 10}b'), isFalse);
        expect(isValidReplyText('a${'\n' * 9}b'), isTrue);
      });
    });

    test('counts code points, not UTF-16 units', () {
      // 500 astral code points are 1,000 UTF-16 units.
      expect(isValidReplyText('\u{1F600}' * 500), isTrue);
      expect(isValidReplyText('\u{1F600}' * 501), isFalse);
    });
  });

  group('retention', () {
    final now = DateTime.utc(2026, 2, 10);

    test('drops entries older than seven days', () {
      final kept = normalizeOutbox([
        _entry(createdAt: now.subtract(const Duration(days: 8))),
        _entry(
          createdAt: now.subtract(const Duration(days: 6)),
          key: '22222222-2222-4222-8222-222222222222',
        ).withStatus(OutboxStatus.sent),
      ], now: now);
      expect(kept, hasLength(1));
      expect(kept.single.status, OutboxStatus.sent);
    });

    test('keeps one entry per item version', () {
      expect(
        normalizeOutbox([
          _entry(),
          _entry(key: _entry().idempotencyKey),
        ], now: DateTime.utc(2026, 1, 31, 18)),
        hasLength(1),
      );
    });
  });
}
