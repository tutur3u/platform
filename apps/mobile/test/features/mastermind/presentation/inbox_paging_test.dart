import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_paging.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

MastermindInboxModel _model({int decisions = 5, int actions = 0}) =>
    MastermindInboxModel.from(
      parsedSnapshot(
        inboxJson([
          for (var i = 1; i <= decisions; i++) inboxItem(i),
          for (var i = 1; i <= actions; i++)
            inboxItem(1000 + i, kind: 'action'),
        ], security: false),
      ),
    );

void main() {
  group('inboxRows', () {
    test('opens each group with its heading and counts asks from zero', () {
      final rows = inboxRows(_model(decisions: 2, actions: 2), 3);
      expect(rows.map((row) => row.runtimeType.toString()), [
        'InboxHeaderRow',
        'InboxItemRow',
        'InboxItemRow',
        'InboxHeaderRow',
        'InboxItemRow',
      ]);
      expect(
        [for (final row in rows.whereType<InboxItemRow>()) row.ordinal],
        [0, 1, 2],
      );
      expect((rows.first as InboxHeaderRow).first, isTrue);
      expect((rows[3] as InboxHeaderRow).first, isFalse);
    });

    test('a group cut by the page boundary stays open at the bottom', () {
      final items = inboxRows(_model(), 3).whereType<InboxItemRow>().toList();
      expect(items.map((row) => row.first), [true, false, false]);
      expect(items.map((row) => row.last), [false, false, false]);
      final all = inboxRows(_model(), 99).whereType<InboxItemRow>();
      expect(all.last.last, isTrue);
    });

    test('525 mixed asks appear exactly once across every page boundary', () {
      final model = _model(decisions: 263, actions: 262);
      final expected = [
        for (final group in model.groups) ...group.items.map((i) => i.id),
      ];
      final collected = <String>[];
      for (
        var visible = inboxPageSize;
        visible < 525 + inboxPageSize;
        visible += inboxPageSize
      ) {
        final rows = inboxRows(
          model,
          visible,
        ).whereType<InboxItemRow>().toList();
        final ids = rows.map((r) => r.item.id).toList();
        expect(ids, expected.take(visible).toList());
        expect(ids.toSet(), hasLength(ids.length));
        collected.addAll(ids.skip(collected.length));
      }
      expect(collected, expected);
      expect(collected.toSet(), hasLength(525));
    });

    test('shows everything once enough is revealed, with no cap', () {
      final rows = inboxRows(_model(decisions: 100), 100);
      expect(rows.whereType<InboxItemRow>(), hasLength(100));
    });
  });

  test('search and product filter the full snapshot before paging', () {
    final snapshot = parsedSnapshot(
      inboxJson([
        for (var i = 1; i <= 525; i++)
          inboxItem(
            i,
            title: i > 500 ? 'Needle $i' : 'Other $i',
            product: i.isOdd ? 'Mastermind' : 'Tuturuuu',
          ),
      ], security: false),
    );
    final all = MastermindInboxModel.from(snapshot);
    final product = all.products.first;
    final filtered = MastermindInboxModel.from(
      snapshot,
      query: 'Needle',
      product: product,
    );
    final expected = [
      for (final group in all.groups)
        for (final item in group.items)
          if (item.title.startsWith('Needle') && item.product == product)
            item.id,
    ];
    expect(
      inboxRows(filtered, 20).whereType<InboxItemRow>().map((r) => r.item.id),
      expected,
    );
    expect(filtered.products, all.products);
    final resolved = MastermindInboxModel.from(
      snapshot,
      query: 'Needle',
      product: product,
      segment: InboxSegment.resolved,
    );
    expect(resolved.shownCount, 0);
    expect(MastermindInboxModel.from(snapshot).shownCount, 525);
  });

  group('InboxPagingController', () {
    test(
      'starts with one page and reveals the next after the loader',
      () async {
        final gate = Completer<void>();
        final calls = <(int, int)>[];
        final paging = InboxPagingController(
          loader: (loaded, limit) {
            calls.add((loaded, limit));
            return gate.future;
          },
        );
        addTearDown(paging.dispose);
        expect(paging.visible, inboxPageSize);
        expect(paging.hasMore(100), isTrue);
        expect(paging.hasMore(inboxPageSize), isFalse);

        final load = paging.loadMore(100);
        expect(paging.status, InboxPagingStatus.loading);
        await paging.loadMore(100); // already loading: ignored
        expect(calls, [(inboxPageSize, inboxPageSize)]);
        gate.complete();
        await load;
        expect(paging.status, InboxPagingStatus.idle);
        expect(paging.visible, inboxPageSize * 2);
      },
    );

    testWidgets('reset drops a prefetch scheduled before a filter change', (
      tester,
    ) async {
      final calls = <int>[];
      final paging = InboxPagingController(
        loader: (loaded, _) async {
          calls.add(loaded);
        },
      );
      addTearDown(paging.dispose);
      paging
        ..requestMore(525)
        ..reset();
      tester.binding.scheduleFrame();
      await tester.pump();
      expect(calls, isEmpty);
      expect(paging.visible, inboxPageSize);
      paging.requestMore(30);
      tester.binding.scheduleFrame();
      await tester.pump();
      await tester.pump();
      expect(calls, [20]);
      expect(paging.visible, 40);
    });

    test('a failure keeps the page and waits for a retry', () async {
      var fail = true;
      final paging = InboxPagingController(
        loader: (_, _) => fail ? Future.error(StateError('x')) : Future.value(),
      );
      addTearDown(paging.dispose);
      await paging.loadMore(100);
      expect(paging.status, InboxPagingStatus.error);
      expect(paging.visible, inboxPageSize);
      fail = false;
      await paging.loadMore(100);
      expect(paging.status, InboxPagingStatus.idle);
      expect(paging.visible, inboxPageSize * 2);
    });

    test('reset drops a page still in flight', () async {
      final gate = Completer<void>();
      final paging = InboxPagingController(loader: (_, _) => gate.future);
      addTearDown(paging.dispose);
      final load = paging.loadMore(100);
      paging.reset();
      gate.complete();
      await load;
      expect(paging.visible, inboxPageSize);
      expect(paging.status, InboxPagingStatus.idle);
    });

    test('nothing loads once every ask is revealed', () async {
      var calls = 0;
      final paging = InboxPagingController(
        loader: (_, _) {
          calls++;
          return Future.value();
        },
      );
      addTearDown(paging.dispose);
      await paging.loadMore(inboxPageSize);
      expect(calls, 0);
    });
  });
}
