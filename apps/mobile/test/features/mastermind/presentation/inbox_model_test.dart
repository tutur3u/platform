import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';

final _now = DateTime.utc(2026, 11, 2, 10);

NeedsYou _ask(
  String id, {
  ItemKind? kind,
  AskUrgency? urgency,
  DateTime? deadline,
  DateTime? createdAt,
}) => NeedsYou(
  id: id,
  title: 'Synthetic $id',
  body: '',
  options: const [],
  recommendedOption: null,
  state: ItemState.open,
  versionHash: 'a' * 64,
  kind: kind,
  urgency: urgency,
  createdAt: createdAt,
  askV2: AskV2Fields(deadlineAt: deadline),
);

List<String> _ids(List<InboxTierGroup> groups, InboxTier tier) => [
  for (final group in groups)
    if (group.tier == tier) ...group.items.map((item) => item.id),
];

void main() {
  group('inboxTierOf', () {
    test('maps pressure to tiers', () {
      expect(
        inboxTierOf(_ask('u', urgency: AskUrgency.urgent), _now),
        InboxTier.urgent,
      );
      expect(
        inboxTierOf(_ask('h', urgency: AskUrgency.high), _now),
        InboxTier.decision,
      );
      expect(inboxTierOf(_ask('o'), _now), InboxTier.decision);
      expect(inboxTierOf(_ask('f', kind: ItemKind.fyi), _now), InboxTier.fyi);
    });

    test('a deadline under 2 h (or overdue) promotes to Urgent', () {
      for (final minutes in [-30, 0, 119]) {
        expect(
          inboxTierOf(
            _ask(
              'd',
              kind: ItemKind.fyi,
              deadline: _now.add(Duration(minutes: minutes)),
            ),
            _now,
          ),
          InboxTier.urgent,
          reason: '$minutes min',
        );
      }
    });

    test('a deadline of 2 h or more does not promote', () {
      expect(
        inboxTierOf(
          _ask('d', deadline: _now.add(const Duration(hours: 2))),
          _now,
        ),
        InboxTier.decision,
      );
    });
  });

  group('groupByTier', () {
    test('orders tiers and omits empty ones', () {
      final groups = groupByTier([
        _ask('fyi', kind: ItemKind.fyi),
        _ask('dec'),
      ], now: _now);
      expect(groups.map((g) => g.tier), [InboxTier.decision, InboxTier.fyi]);
      expect(groups.first.key, 'tier-decision');
    });

    test('sorts by deadline, then blocks, then age, then id', () {
      final early = _now.add(const Duration(hours: 5));
      final late = _now.add(const Duration(hours: 9));
      final items = [
        _ask('e-none'),
        _ask('d-late', deadline: late),
        _ask('c-old', createdAt: _now.subtract(const Duration(days: 2))),
        _ask('b-blocks'),
        _ask('a-early', deadline: early),
        _ask('f-new', createdAt: _now.subtract(const Duration(hours: 1))),
      ];
      List<String> run(List<NeedsYou> input) => _ids(
        groupByTier(
          input,
          now: _now,
          blocks: (item) => item.id == 'b-blocks' ? 3 : 0,
        ),
        InboxTier.decision,
      );
      const expected = [
        'a-early',
        'd-late',
        'b-blocks',
        'c-old',
        'f-new',
        'e-none',
      ];
      expect(run(items), expected);
      expect(run(items.reversed.toList()), expected);
    });

    test('equal keys fall back to id', () {
      final groups = groupByTier([_ask('b'), _ask('a')], now: _now);
      expect(_ids(groups, InboxTier.decision), ['a', 'b']);
    });
  });
}
