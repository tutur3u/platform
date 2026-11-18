import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';
import 'package:mobile/features/profile/view/profile_timeline_view.dart';

import '../../../helpers/helpers.dart';

final _now = DateTime(2026, 11, 18, 18);

ProfileTimelineItem _item(String id, String type, DateTime at, [String? t]) =>
    ProfileTimelineItem(
      id: id,
      type: type,
      createdAt: at,
      scope: 'personal',
      title: t ?? id,
    );

final List<ProfileTimelineItem> _items = [
  _item('Draft brief', 'task', DateTime(2026, 11, 18, 9)),
  _item('Lunch', 'transaction', DateTime(2026, 11, 18, 12)),
  _item('Client call', 'calendar', DateTime(2026, 11, 17, 10)),
  _item('Ideas', 'note', DateTime(2026, 11, 14, 8)),
];

void main() {
  Future<void> pump(
    WidgetTester tester, {
    List<ProfileTimelineItem>? items,
    ProfileTimelineFilter filter = const ProfileTimelineFilter(),
    ValueChanged<ProfileTimelineFilter>? onFilterChanged,
    ValueChanged<ProfileTimelineItem>? onOpen,
    bool loading = false,
    bool hasMore = false,
    bool loadingMore = false,
    VoidCallback? onLoadMore,
    VoidCallback? onRetry,
    ProfileTimelineAvailability availability =
        ProfileTimelineAvailability.complete,
  }) async {
    await tester.pumpApp(
      ProfileTimelineView(
        items: items ?? _items,
        now: _now,
        filter: filter,
        onFilterChanged: onFilterChanged ?? (_) {},
        onOpen: onOpen ?? (_) {},
        loading: loading,
        hasMore: hasMore,
        loadingMore: loadingMore,
        onLoadMore: onLoadMore,
        onRetry: onRetry,
        availability: availability,
        contentTopPadding: 40,
      ),
    );
    if (loadingMore) {
      await tester.pump(const Duration(milliseconds: 100));
    } else {
      await tester.pumpAndSettle();
    }
  }

  testWidgets('groups activity by day, newest day and item first', (
    tester,
  ) async {
    await pump(tester);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Yesterday'), findsOneWidget);
    double top(String text) => tester.getTopLeft(find.text(text)).dy;
    expect(top('Today'), lessThan(top('Lunch')));
    expect(top('Lunch'), lessThan(top('Draft brief')));
    expect(top('Draft brief'), lessThan(top('Yesterday')));
    expect(top('Yesterday'), lessThan(top('Client call')));
    expect(top('Client call'), lessThan(top('Ideas')));
    expect(tester.takeException(), isNull);
  });

  testWidgets('day header stays pinned while its rows scroll under it', (
    tester,
  ) async {
    final many = [
      for (var i = 0; i < 30; i++)
        _item('Row $i', 'task', DateTime(2026, 11, 18, 17, 59 - i)),
    ];
    await pump(tester, items: many);
    await tester.drag(
      find.byKey(const ValueKey('profile-timeline')),
      const Offset(0, -500),
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Today')).dy, greaterThan(40));
    expect(tester.getTopLeft(find.text('Today')).dy, lessThan(80));
  });

  testWidgets('openable rows open; the time sits beside the title', (
    tester,
  ) async {
    final opened = <String>[];
    await pump(tester, onOpen: (item) => opened.add(item.id));
    await tester.tap(find.text('Lunch'));
    expect(opened, ['Lunch']);
  });

  testWidgets('empty, unavailable and loading states', (tester) async {
    await pump(tester, items: const []);
    expect(find.byKey(const ValueKey('timeline-empty')), findsOneWidget);

    var retried = 0;
    await pump(
      tester,
      items: const [],
      availability: ProfileTimelineAvailability.unavailable,
      onRetry: () => retried++,
    );
    expect(find.text('Activity could not be refreshed.'), findsOneWidget);
    expect(find.text('No recent activity in this workspace'), findsNothing);
    await tester.tap(find.text('Retry'));
    expect(retried, 1);

    await tester.pumpApp(
      ProfileTimelineView(
        items: const [],
        onOpen: (_) {},
        loading: true,
        now: _now,
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('timeline-loading')), findsOneWidget);
    expect(find.byKey(const ValueKey('timeline-empty')), findsNothing);
  });

  testWidgets('source chips and the Today range narrow loaded activity', (
    tester,
  ) async {
    ProfileTimelineFilter? changed;
    await pump(tester, onFilterChanged: (filter) => changed = filter);
    await tester.tap(find.byKey(const ValueKey('timeline-source-finance')));
    expect(changed?.source, ProfileTimelineSource.finance);

    await pump(
      tester,
      filter: const ProfileTimelineFilter(
        source: ProfileTimelineSource.finance,
      ),
    );
    expect(find.text('Lunch'), findsOneWidget);
    expect(find.text('Draft brief'), findsNothing);
    expect(find.text('Yesterday'), findsNothing);

    await pump(tester, filter: const ProfileTimelineFilter(todayOnly: true));
    expect(find.text('Draft brief'), findsOneWidget);
    expect(find.text('Client call'), findsNothing);

    await pump(tester, filter: const ProfileTimelineFilter(query: 'cli'));
    expect(find.text('Client call'), findsOneWidget);
    expect(find.text('Lunch'), findsNothing);
  });

  testWidgets('filters that hide everything offer to clear them', (
    tester,
  ) async {
    ProfileTimelineFilter? changed;
    await pump(
      tester,
      filter: const ProfileTimelineFilter(query: 'nothing matches'),
      onFilterChanged: (filter) => changed = filter,
    );
    expect(
      find.byKey(const ValueKey('timeline-filtered-empty')),
      findsOneWidget,
    );
    await tester.tap(find.text('Clear filters'));
    expect(changed, const ProfileTimelineFilter());
  });

  testWidgets('requests the next page near the end, then shows progress', (
    tester,
  ) async {
    var requests = 0;
    await pump(tester, hasMore: true, onLoadMore: () => requests++);
    expect(requests, greaterThan(0));
    expect(find.text('All loaded activity shown'), findsNothing);

    await pump(tester, hasMore: true, loadingMore: true);
    expect(find.byKey(const ValueKey('timeline-loading-more')), findsOneWidget);
  });
}
