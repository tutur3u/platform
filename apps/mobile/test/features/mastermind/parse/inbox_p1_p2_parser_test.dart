import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

// The hub's p1/p2 Inbox keys against the strict snapshot parser: old-only,
// old+new and malformed values. A bad optional value is dropped; it never
// rejects the snapshot or throws.
const _fixtureDir = '../../packages/types/src/mastermind/fixtures';

Map<String, dynamic> _map(Object? value) => value! as Map<String, dynamic>;

Map<String, dynamic> _fixture() =>
    jsonDecode(File('$_fixtureDir/ask-v2.fixture.json').readAsStringSync())
        as Map<String, dynamic>;

Map<String, dynamic> _row(int n) => _map(
  (_fixture()['rows'] as List).firstWhere(
    (row) => _map(
      row,
    )['id'].toString().endsWith(n.toRadixString(16).padLeft(2, '0')),
  ),
);

Uint8List _bytes(Map<String, dynamic> root) =>
    Uint8List.fromList(utf8.encode(jsonEncode(root)));

Map<String, dynamic> _base() => MastermindSnapshotBuilder.defaults().toJson();

/// The default snapshot with [rows] as its open Needs-you list.
Map<String, dynamic> _withAsks(List<Map<String, dynamic>> rows) {
  final root = _base();
  final now = _map(root['now']);
  now['needs_you'] = rows;
  now['digest'] = <dynamic>[];
  return root;
}

List<NeedsYou> _items(Map<String, dynamic> root) {
  final outcome = parseMastermindSnapshot(_bytes(root));
  expect(outcome, isA<ParseAccepted>(), reason: outcome.toString());
  return openAsks((outcome as ParseAccepted).snapshot);
}

NeedsYou _one(Map<String, dynamic> row) => _items(_withAsks([row])).single;

void main() {
  group('old-only snapshots', () {
    test('parse unchanged with empty Inbox fields', () {
      final outcome = parseMastermindSnapshot(_bytes(_base()));
      expect(outcome, isA<ParseAccepted>());
      final items = openAsks((outcome as ParseAccepted).snapshot);
      expect(items, isNotEmpty);
      for (final item in items) {
        expect(item.askV2.optionsV2, isEmpty);
        expect(item.askV2.recommendedId, isNull);
        expect(item.askV2.riskClass, isNull);
        expect(item.askV2.status, isNull);
        expect(item.askV2.deadlineAt, isNull);
      }
    });

    test('an old row still builds a complete card with positional options', () {
      final item = _one(_row(2));
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.incomplete, isFalse);
      expect([for (final o in ask.card.options) o.id], ['opt-0', 'opt-1']);
      expect(ask.card.recommendedLabel, 'Approve');
      expect(ask.optionIndexes, [0, 1]);
    });

    test('an unknown key is still a schema violation', () {
      final outcome = parseMastermindSnapshot(_bytes(_withAsks([_row(8)])));
      expect(outcome, isA<ParseRejected>());
      final row = _row(8)..remove('future_field');
      expect(_one(row).id, row['id']);
    });
  });

  group('old plus new fields', () {
    test('accepts p1 and p2 keys and routes them to the AskCard', () {
      final item = _one(_row(1));
      final v2 = item.askV2;
      expect(v2.optionsV2.map((o) => o.id), ['ship-now', 'hold', 'staging']);
      expect(v2.optionsV2.first.note, isNotNull);
      expect(v2.recommendedId, 'ship-now');
      expect(v2.recommendedWhy, isNotNull);
      expect(v2.inboxClass, AskInboxClass.urgent);
      expect(v2.inboxUrgency, AskInboxUrgency.now);
      expect(v2.deadlineAt, DateTime.utc(2026, 11, 2, 3, 30));
      expect(v2.updatedAt, DateTime.utc(2026, 11, 2, 1, 15));
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.recommendedId, 'ship-now');
      expect(ask.card.recommendedWhy, v2.recommendedWhy);
      expect(ask.card.inboxClass, AskInboxClass.urgent);
      expect(ask.card.deadlineAt, v2.deadlineAt);
      expect(ask.optionIndexes, [0, 1, 2]);
    });

    test('routes risk_class and reversible', () {
      final item = _one(_row(14));
      expect(item.askV2.riskClass, AskRiskClass.deploy);
      expect(item.askV2.reversible, isFalse);
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.risky, isTrue);
      expect(ask.reversible, isFalse);
    });

    test('an unrecognised risk_class is risky, never one tap', () {
      for (final value in <Object?>[
        'nuclear',
        7,
        <String, Object?>{'a': 1},
      ]) {
        final item = _one({..._row(1), 'risk_class': value});
        expect(item.askV2.riskClass, AskRiskClass.unknown);
        final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
        expect(ask.card.risky, isTrue, reason: '$value');
      }
    });

    test('an explicit normal risk_class stays one tap', () {
      final item = _one({..._row(1), 'risk_class': 'normal'});
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.risky, isFalse);
      expect(ask.optionIndexes, [0, 1, 2]);
    });

    test('keeps an expired status on an open row', () {
      final item = _one(_row(9));
      expect(item.askV2.status, AskStatus.expired);
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.phase, AskPhase.expired);
    });

    test('reads resolved_via on a resolved history row', () {
      final root = _base()..['decisions_resolved'] = [_row(12)];
      final outcome = parseMastermindSnapshot(_bytes(root));
      expect(outcome, isA<ParseAccepted>());
      final resolved = (outcome as ParseAccepted).snapshot.resolvedItems;
      expect(resolved.single.askV2.resolvedVia, AskResolvedVia.mobile);
      final ask = inboxAskFor(resolved.single);
      expect(ask.card.phase, AskPhase.answered);
      expect(ask.card.resolvedVia, AskResolvedVia.mobile);
    });

    test('accepts every fixture row (except the unknown-key row)', () {
      final rows = [
        for (final row
            in (_fixture()['rows'] as List).cast<Map<String, dynamic>>())
          {...row}..remove('future_field'),
      ];
      final open = [
        for (final row in rows)
          if (row['status'] != 'resolved') row,
      ];
      final root = _withAsks(open)
        ..['decisions_resolved'] = [
          rows.firstWhere((r) => r['status'] == 'resolved'),
        ];
      expect(parseMastermindSnapshot(_bytes(root)), isA<ParseAccepted>());
    });
  });

  group('malformed values', () {
    final bad = <String, Object?>{
      'inbox_class': 5,
      'resolved_via': 'pigeon',
      'deadline_at': '2026-11-02',
      'updated_at': 'yesterday',
      'recommended_id': 123,
      'recommended_why': 'x' * 400,
      'status': 'weird',
      'text_complete': 'yes',
      'reversible': 'no',
      'options_v2': 'not-a-list',
    };
    for (final entry in bad.entries) {
      test('${entry.key} is dropped, never fatal', () {
        final item = _one({..._row(1), entry.key: entry.value});
        final v2 = item.askV2;
        expect(switch (entry.key) {
          'inbox_class' => v2.inboxClass,
          'resolved_via' => v2.resolvedVia,
          'deadline_at' => v2.deadlineAt,
          'updated_at' => v2.updatedAt,
          'recommended_id' => v2.recommendedId,
          'recommended_why' => v2.recommendedWhy,
          'status' => v2.status,
          'text_complete' => v2.textComplete,
          'reversible' => v2.reversible,
          _ => v2.optionsV2.isEmpty ? null : v2.optionsV2,
        }, isNull);
        expect(inboxAskFor(item).card.id, item.id);
      });
    }

    test('one bad options_v2 entry voids the list and falls back', () {
      final item = _one({
        ..._row(1),
        'options_v2': [
          {'id': 'a', 'label': 'A'},
          {'id': 'a', 'label': 'duplicate id'},
        ],
      });
      expect(item.askV2.optionsV2, isEmpty);
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(
        [for (final o in ask.card.options) o.id],
        ['opt-0', 'opt-1', 'opt-2'],
      );
      expect(ask.card.recommendedLabel, 'Ship now');
    });

    test('a recommended_id that matches no option is dropped, not guessed', () {
      final item = _one({
        ..._row(1),
        'recommended_id': 'nope',
        'recommended_option': 'Missing',
      });
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.recommendedId, isNull);
      expect(ask.card.recommendedWhy, isNull);
    });

    test('an options_v2 label with no wire option is never answerable', () {
      final item = _one({
        ..._row(1),
        'options_v2': [
          {'id': 'a', 'label': 'Ship now'},
          {'id': 'b', 'label': 'Brand new choice'},
        ],
      });
      expect(inboxAskFor(item).optionIndexes, [0, null]);
    });

    test('duplicate option labels disable one-tap for the whole card', () {
      final item = _one({
        ..._row(1),
        'options': ['Yes', 'No'],
        'recommended_option': null,
        'options_v2': [
          {'id': 'a', 'label': 'Yes'},
          {'id': 'b', 'label': 'Yes'},
          {'id': 'c', 'label': 'No'},
        ],
        'recommended_id': null,
      });
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.options, hasLength(3));
      expect(ask.optionIndexes, [null, null, null]);
    });

    test('duplicate plain wire labels disable one-tap even with unique v2', () {
      final item = _one({
        ..._row(1),
        'options': ['entity_phuc', 'Entity phuc', 'No'],
        'recommended_option': null,
        'options_v2': [
          {'id': 'a', 'label': 'Entity phuc'},
          {'id': 'c', 'label': 'No'},
        ],
        'recommended_id': null,
      });
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.optionIndexes, [null, null]);
    });

    test('unique labels still map to their wire index by id order', () {
      final item = _one({
        ..._row(1),
        'options_v2': [
          {'id': 'x', 'label': 'Hold until Monday'},
          {'id': 'y', 'label': 'Ship now'},
        ],
        'recommended_id': null,
      });
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.optionIndexes, [1, 0]);
    });

    test('an empty options list on a decision is an incomplete card', () {
      final item = _one({
        ..._row(1),
        'options': <String>[],
        'options_v2': null,
        'recommended_option': null,
      });
      final ask = inboxAskFor(item, now: DateTime.utc(2026, 11, 2, 3));
      expect(ask.card.incomplete, isTrue);
      expect(
        ask.card.incompleteReasons,
        contains(AskIncompleteReason.missingOptions),
      );
    });
  });
}
