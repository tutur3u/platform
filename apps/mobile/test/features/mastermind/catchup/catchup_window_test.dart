import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_parser.dart';
import 'package:mobile/features/mastermind/catchup/catchup_view_model.dart';
import 'package:mobile/features/mastermind/catchup/catchup_visit.dart';

import '../../../helpers/mastermind_catchup_fixture.dart';

final _now = DateTime.utc(2026, 1, 31, 17, 32);
final CatchupDigest _digest = parseCatchup(catchupDigestJson())!;

void main() {
  group('CatchupVisitTracker', () {
    test('the first visit shows 24 hours and nothing is new', () async {
      final store = MemoryCatchupVisitStore();
      final tracker = CatchupVisitTracker(store: store);
      await tracker.load();
      final window = tracker.windowAt(_now);
      expect(window.firstVisit, isTrue);
      expect(window.start, _now.subtract(const Duration(hours: 24)));
      expect(store.value, _now);
    });

    test('the default window is since the last visit', () async {
      final last = DateTime.utc(2026, 1, 31, 16);
      final tracker = CatchupVisitTracker(store: MemoryCatchupVisitStore(last));
      await tracker.load();
      final window = tracker.windowAt(_now);
      expect(window.start, last);
      expect(window.newSince, last);
    });

    test(
      'a quick return keeps the window; a long gap starts a new one',
      () async {
        final last = DateTime.utc(2026, 1, 31, 16);
        final tracker = CatchupVisitTracker(
          store: MemoryCatchupVisitStore(last),
        );
        await tracker.load();
        tracker.windowAt(_now);
        final soon = tracker.windowAt(_now.add(const Duration(minutes: 10)));
        expect(soon.newSince, last);
        final later = _now.add(const Duration(hours: 5));
        final next = tracker.windowAt(later);
        // The new visit starts where the previous render stopped.
        expect(next.newSince, _now.add(const Duration(minutes: 10)));
      },
    );

    test('a marker in the future or a week old is clamped', () async {
      final future = CatchupVisitTracker(
        store: MemoryCatchupVisitStore(_now.add(const Duration(days: 1))),
      );
      await future.load();
      expect(future.windowAt(_now).start, _now);
      final old = CatchupVisitTracker(
        store: MemoryCatchupVisitStore(_now.subtract(const Duration(days: 30))),
      );
      await old.load();
      expect(old.windowAt(_now).start, _now.subtract(const Duration(days: 7)));
    });
  });

  group('CatchupViewModel', () {
    final lastVisit = DateTime.utc(2026, 1, 31, 16, 15);
    final window = CatchupWindow(start: lastVisit, newSince: lastVisit);

    CatchupViewModel build({bool showEarlier = false, CatchupWindow? w}) =>
        CatchupViewModel.build(
          digest: _digest,
          window: w ?? window,
          now: _now,
          showEarlier: showEarlier,
        );

    List<String> ids(CatchupViewModel model, CatchupSectionKey key) => [
      for (final section in model.sections)
        if (section.key == key)
          for (final group in section.groups) ...group.items.map((i) => i.id),
    ];

    test('filters by time and counts what it shows', () {
      final model = build();
      expect(ids(model, CatchupSectionKey.shipped), ['s1']);
      expect(ids(model, CatchupSectionKey.blocked), ['b1']);
      expect(ids(model, CatchupSectionKey.changed), isEmpty);
      expect(model.counts.needsYou, 3);
      expect(model.counts.shipped, 1);
      expect(model.counts.changed, 0);
      expect(model.earlierCount, 6);
    });

    test('the hub counts stand while nothing is filtered out', () {
      final model = build(
        w: CatchupWindow(start: _now.subtract(const Duration(hours: 24))),
      );
      expect(model.counts.shipped, 3);
      expect(model.counts.changed, 2);
      expect(model.earlierCount, 0);
    });

    test('Show earlier widens to a day and draws the divider', () {
      final model = build(showEarlier: true);
      final group = model.sections
          .firstWhere((s) => s.key == CatchupSectionKey.shipped)
          .groups
          .firstWhere((g) => g.slug == 'tuturuuu');
      expect(group.items.map((i) => i.id), ['s1', 's2']);
      expect(group.newCount, 1);
      expect(group.hasDivider, isTrue);
      expect(model.earlierCount, 0);
    });

    test('groups are per product, newest first, product-less last', () {
      final model = build(showEarlier: true);
      final needs = model.sections.first;
      expect(needs.key, CatchupSectionKey.needsYou);
      expect(needs.groups.map((g) => g.slug), ['upskii', 'tuturuuu', null]);
      // The neutral line sits with the product-less rows, never under a
      // product, whatever product the hub sent with it.
      expect(needs.groups.last.items.map((i) => i.id), ['n3']);
      final changed = model.sections.firstWhere(
        (s) => s.key == CatchupSectionKey.changed,
      );
      expect(changed.groups.last.slug, isNull);
    });

    test('sections keep their order and unknown sections come last', () {
      final model = build(showEarlier: true);
      expect(model.sections.last.key, CatchupSectionKey.unknown);
    });

    test('partial coverage, and a hub window that starts late, both warn', () {
      expect(build().partial, isTrue);
      final complete = CatchupViewModel.build(
        digest: CatchupDigest(
          coverage: CatchupCoverage.ok,
          products: const [],
          sections: const [],
          windowStart: _now.subtract(const Duration(hours: 2)),
        ),
        window: window,
        now: _now,
      );
      expect(complete.partial, isFalse);
      final late = CatchupViewModel.build(
        digest: CatchupDigest(
          coverage: CatchupCoverage.ok,
          products: const [],
          sections: const [],
          windowStart: _now.subtract(const Duration(minutes: 5)),
        ),
        window: window,
        now: _now,
      );
      expect(late.partial, isTrue);
    });
  });
}
