import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/asks/ask_card.dart';
import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

final DateTime _now = DateTime.utc(2026, 11, 2, 3);

AskCard _card([Map<String, dynamic> extra = const {}]) => AskCard.parse({
  'id': inboxItemId(1),
  'version_hash': inboxHash('a'),
  ...extra,
}, now: _now)!;

const Map<String, Object?> _ok = {
  'title': 'Q',
  'body': 'B',
  'options': ['A'],
};

List<String> _reasons(Map<String, dynamic> extra) => [
  for (final r in _card({..._ok, ...extra}).incompleteReasons) r.wireName,
];

AskInboxClass _class(Map<String, dynamic> extra) => _card(extra).inboxClass;

void main() {
  group('field fallback', () {
    test('reads old-only keys with positional option ids', () {
      final card = _card({
        'title': 'Q',
        'body': 'B',
        'options': ['Yes', 'No'],
        'recommended_option': 'No',
      });
      expect([for (final o in card.options) o.id], ['opt-0', 'opt-1']);
      expect([card.recommendedId, card.recommendedLabel], ['opt-1', 'No']);
      expect(card.recommendedWhy, isNull);
    });

    test('prefers options_v2 and recommended_id when present', () {
      final card = _card({
        'title': 'Q',
        'body': 'B',
        'options': ['Old A', 'Old B'],
        'recommended_option': 'Old A',
        'options_v2': [
          {'id': 'a', 'label': 'New A', 'note': 'n'},
          {'id': 'b', 'label': 'New B'},
        ],
        'recommended_id': 'b',
        'recommended_why': 'Because.',
      });
      expect(
        [for (final o in card.options) o.toJson()],
        [
          {'id': 'a', 'label': 'New A', 'note': 'n'},
          {'id': 'b', 'label': 'New B', 'note': null},
        ],
      );
      expect(card.recommendedId, 'b');
      expect(card.recommendedWhy, 'Because.');
    });

    test('accepts new-only keys (no legacy options)', () {
      final card = _card({
        'title': 'Q',
        'body': 'B',
        'options_v2': [
          {'id': 'a', 'label': 'A'},
        ],
        'recommended_id': 'a',
      });
      expect(card.recommendedLabel, 'A');
      expect(card.incomplete, isFalse);
    });

    test(
      'falls back to the recommended label when recommended_id is unknown',
      () {
        final card = _card({
          'title': 'Q',
          'body': 'B',
          'options_v2': [
            {'id': 'a', 'label': 'A'},
            {'id': 'b', 'label': 'B'},
          ],
          'recommended_id': 'zzz',
          'recommended_option': 'A',
        });
        expect(card.recommendedId, 'a');
      },
    );

    test('drops a recommendation that matches no option', () {
      final card = _card({
        'title': 'Q',
        'body': 'B',
        'options': ['A'],
        'recommended_option': 'Nope',
        'recommended_why': 'Orphan why',
      });
      expect([card.recommendedId, card.recommendedWhy], [null, null]);
    });

    test('falls back to legacy options when options_v2 is unusable', () {
      final bad = <Object?>[
        [
          {'id': 'a', 'label': 'A'},
          {'id': 'a', 'label': 'dup'},
        ],
        [
          {'id': 'a'},
        ],
        'nope',
        List.filled(9, {'id': 'x', 'label': 'y'}),
      ];
      for (final value in bad) {
        final card = _card({
          'title': 'Q',
          'body': 'B',
          'options': ['Legacy'],
          'options_v2': value,
          'recommended_id': 'a',
          'recommended_option': 'Legacy',
        });
        expect([for (final o in card.options) o.label], ['Legacy']);
        expect(card.recommendedId, 'opt-0');
      }
    });

    test('ignores unknown keys, unknown enums and oversize optional text', () {
      final card = _card({
        'title': 'Q',
        'body': 'B',
        'options': ['A'],
        'recommended_option': 'A',
        'recommended_why': 'x' * 281,
        'inbox_class': 'banana',
        'risk_class': 'lava',
        'urgency': 'yesterday',
        'resolved_via': 'pigeon',
        'deadline_at': 'soon-ish',
        'future_field': {'a': 1},
      });
      expect(card.recommendedWhy, isNull);
      expect(card.inboxClass, AskInboxClass.decision);
      expect(card.riskClass, AskRiskClass.unknown);
      expect(card.risky, isTrue);
      expect(card.urgency, isNull);
      expect(card.resolvedVia, isNull);
      expect(card.deadlineAt, isNull);
    });

    group('risk gate fails closed', () {
      for (final entry in <String, Object?>{
        'an unknown string': 'lava',
        'an empty string': '',
        'a different-case class': 'Deploy',
        'a number': 5,
        'an object': {'class': 'deploy'},
        'a list': ['normal'],
        'a boolean': false,
      }.entries) {
        test('${entry.key} is unknown and risky', () {
          final card = _card({..._ok, 'risk_class': entry.value});
          expect(card.riskClass, AskRiskClass.unknown);
          expect(card.risky, isTrue);
          expect(card.toJson()['risk_class'], 'unknown');
        });
      }

      test('an explicit normal allows one tap', () {
        final card = _card({..._ok, 'risk_class': 'normal'});
        expect(card.riskClass, AskRiskClass.normal);
        expect(card.risky, isFalse);
      });

      test('a published class is risky', () {
        for (final name in ['deploy', 'spend', 'credential', 'security']) {
          expect(
            _card({..._ok, 'risk_class': name}).risky,
            isTrue,
            reason: name,
          );
        }
      });

      test('an absent or null risk_class keeps the old behaviour', () {
        for (final extra in <Map<String, dynamic>>[
          {},
          {'risk_class': null},
        ]) {
          final card = _card({..._ok, ...extra});
          expect(card.riskClass, isNull);
          expect(card.risky, isFalse);
          expect(card.toJson()['risk_class'], isNull);
        }
      });
    });

    test('rejects only a malformed identity', () {
      expect(AskCard.parse(null, now: _now), isNull);
      expect(AskCard.parse(<Object?>[], now: _now), isNull);
      expect(AskCard.parse({'id': inboxItemId(1)}, now: _now), isNull);
      expect(
        AskCard.parse({'id': 'bad', 'version_hash': inboxHash('a')}),
        isNull,
      );
      expect(_card(), isNotNull);
    });

    test('the existing detail urgency vocabulary is untouched', () {
      final detail = parseAskDetail({
        'id': inboxItemId(1),
        'version_hash': inboxHash('a'),
        'urgency': 'now',
      })!;
      expect(detail.urgency, isNull);
      expect(detail.inboxUrgency, AskInboxUrgency.now);
    });
  });

  group('inbox_class derivation', () {
    test('maps urgency', () {
      expect(_class({'urgency': 'now'}), AskInboxClass.urgent);
      expect(_class({'urgency': 'today'}), AskInboxClass.decision);
      expect(_class({'urgency': 'soon'}), AskInboxClass.decision);
      expect(_class({'urgency': 'whenever'}), AskInboxClass.fyi);
    });

    test('without urgency, fyi kind is fyi and the rest are decisions', () {
      expect(_class({'kind': 'fyi'}), AskInboxClass.fyi);
      expect(_class({'kind': 'action'}), AskInboxClass.decision);
      expect(_class({}), AskInboxClass.decision);
    });

    test('a past deadline is urgent, even over whenever', () {
      expect(
        _class({'urgency': 'whenever', 'deadline_at': '2026-11-02T02:59:59Z'}),
        AskInboxClass.urgent,
      );
      expect(
        _class({'urgency': 'whenever', 'deadline_at': '2026-11-02T03:00:00Z'}),
        AskInboxClass.fyi,
      );
      expect(
        _class({
          'urgency': 'today',
          'deadline_at': '2026-11-02T09:00:00+07:00',
        }),
        AskInboxClass.urgent,
      );
    });

    test('a closed ask is not promoted by its deadline', () {
      const past = {'urgency': 'soon', 'deadline_at': '2026-11-01T00:00:00Z'};
      expect(_class({...past, 'status': 'expired'}), AskInboxClass.decision);
      expect(_class({...past, 'state': 'answered'}), AskInboxClass.decision);
    });

    test('an explicit inbox_class wins', () {
      expect(
        _class({
          'inbox_class': 'fyi',
          'urgency': 'now',
          'deadline_at': '2020-01-01T00:00:00Z',
        }),
        AskInboxClass.fyi,
      );
    });
  });

  group('incomplete rule', () {
    test('a full card is complete', () {
      expect(_card(_ok).incomplete, isFalse);
    });

    test('flags missing question text', () {
      expect(_reasons({'title': '  '}), ['missing_question']);
      expect(_reasons({'body': ''}), ['missing_text']);
      expect(_reasons({'body': '', 'ask_text': 'Full text'}), isEmpty);
    });

    test('flags missing options on answerable asks only', () {
      expect(_reasons({'options': <String>[]}), ['missing_options']);
      expect(_reasons({'options': <String>[], 'urgency': 'now'}), [
        'missing_options',
      ]);
      expect(_reasons({'options': <String>[], 'kind': 'fyi'}), isEmpty);
      expect(_reasons({'options': <String>[], 'urgency': 'whenever'}), isEmpty);
      expect(
        _reasons({
          'options': ['ok', 7],
        }),
        ['missing_options'],
      );
    });

    test('flags truncated and text_complete=false', () {
      expect(_reasons({'ask_truncated': true}), ['truncated']);
      expect(_reasons({'text_complete': false}), ['text_incomplete']);
    });

    test('lists every reason in a fixed order', () {
      expect(
        _card({
          'options': <String>[],
          'ask_truncated': true,
        }).incompleteReasons.map((r) => r.wireName),
        ['missing_question', 'missing_text', 'truncated', 'missing_options'],
      );
    });
  });

  group('timestamps', () {
    test('normalizes offsets to UTC seconds', () {
      final parsed = parseAskTimestamp('2026-11-02T10:30:00.987+07:00')!;
      expect(formatAskTimestamp(parsed), '2026-11-02T03:30:00Z');
    });

    test('rejects naive, date-only and impossible values', () {
      for (final bad in <Object?>[
        '2026-11-02T10:30:00',
        '2026-11-02',
        '2026-02-30T00:00:00Z',
        '2026-13-01T00:00:00Z',
        '2026-11-02T24:00:00Z',
        '2026-11-02T10:30:00+24:00',
        '1969-12-31T23:59:59Z',
        42,
        null,
      ]) {
        expect(parseAskTimestamp(bad), isNull, reason: '$bad');
      }
    });
  });
}
