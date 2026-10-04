import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';

import '../../../helpers/helpers.dart';

void main() {
  final items = [
    for (var day = 0; day < 15; day++)
      for (var row = 0; row < 4; row++)
        ProfileTimelineItem(
          id: '$day-$row',
          type: 'task',
          title: 'Day $day row $row',
          createdAt: DateTime(2026, 10, 15 - day, 12, row),
          scope: 'personal',
        ),
  ];

  testWidgets(
    'near-bottom reveal is incremental, deduplicated and ends honestly',
    (tester) async {
      tester.view.physicalSize = const Size(800, 300);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpApp(
        ProfileTimelineBrowser(
          fullSurface: true,
          datesOpen: false,
          pageSize: 2,
          items: [...items, items.first],
          onOpen: (_) {},
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Day 0 row 3'), findsOneWidget);
      expect(find.text('Day 2 row 0'), findsNothing);
      expect(find.text('Day 14 row 0'), findsNothing);
      expect(find.text('Oct 2026'), findsNothing);
      final scroll = tester.state<ScrollableState>(
        find.byType(Scrollable).first,
      );
      // Repeated notifications in the same frame append only one batch.
      scroll.position.jumpTo(scroll.position.maxScrollExtent - 100);
      scroll.position.jumpTo(scroll.position.maxScrollExtent - 50);
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump();
      await tester.pump();
      expect(find.text('Day 2 row 3', skipOffstage: false), findsOneWidget);
      expect(find.text('Day 4 row 0'), findsNothing);
      for (var i = 0; i < 10; i++) {
        scroll.position.jumpTo(scroll.position.maxScrollExtent);
        await tester.pump();
        await tester.pump();
      }
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pumpAndSettle();
      expect(find.text('Day 14 row 0'), findsOneWidget);
      expect(find.byKey(const ValueKey('timeline-more-days')), findsNothing);
      expect(find.text('All loaded activity shown'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('short viewport automatically fills without a scroll gesture', (
    tester,
  ) async {
    await tester.pumpApp(
      ProfileTimelineBrowser(
        fullSurface: true,
        datesOpen: false,
        pageSize: 1,
        items: [items[0], items[4], items[8]],
        onOpen: (_) {},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Day 0 row 0'), findsOneWidget);
    expect(find.text('Day 1 row 0'), findsOneWidget);
    expect(find.text('Day 2 row 0', skipOffstage: false), findsOneWidget);
    expect(find.byKey(const ValueKey('timeline-loaded-end')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a large single day mounts only viewport rows', (tester) async {
    await tester.pumpApp(
      ProfileTimelineBrowser(
        fullSurface: true,
        datesOpen: false,
        items: [
          for (var i = 0; i < 2000; i++)
            ProfileTimelineItem(
              id: '$i',
              type: 'task',
              title: 'Large row $i',
              createdAt: DateTime(2026, 10, 4, 12),
              scope: 'personal',
            ),
        ],
        onOpen: (_) {},
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byType(ListTile, skipOffstage: false).evaluate().length,
      lessThan(20),
    );
    expect(find.text('Large row 500'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'status and initial header clearance leave the viewport on scroll',
    (tester) async {
      await tester.pumpApp(
        ProfileTimelineBrowser(
          fullSurface: true,
          datesOpen: false,
          contentTopPadding: 100,
          items: items,
          status: const Text('Some activity is unavailable. Retry'),
          onOpen: (_) {},
        ),
      );
      await tester.pumpAndSettle();
      final top = tester
          .getTopLeft(
            find.text(
              'Some activity is unavailable. Retry',
              skipOffstage: false,
            ),
          )
          .dy;
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -350));
      await tester.pumpAndSettle();
      expect(
        tester
            .getTopLeft(
              find.text(
                'Some activity is unavailable. Retry',
                skipOffstage: false,
              ),
            )
            .dy,
        lessThan(top - 100),
      );
      expect(
        tester
            .getBottomLeft(
              find.text(
                'Some activity is unavailable. Retry',
                skipOffstage: false,
              ),
            )
            .dy,
        lessThan(0),
      );
      expect(find.text('Oct 2026'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
