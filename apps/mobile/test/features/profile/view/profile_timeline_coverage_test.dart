import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';
import 'package:mobile/features/profile/view/profile_timeline_grouping.dart';
import 'package:mobile/features/profile/view/profile_timeline_view.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/helpers.dart';

ProfileTimelineItem _item(String id, DateTime at, {String? title}) =>
    ProfileTimelineItem(
      id: id,
      type: 'task',
      createdAt: at,
      scope: 'personal',
      title: title ?? id,
    );

final _now = DateTime(2026, 10, 15, 18);

List<ProfileTimelineItem> _page(int page) => [
  for (var day = 0; day < 3; day++)
    for (var row = 0; row < 4; row++)
      _item(
        'Day ${page * 3 + day} row $row',
        DateTime(2026, 10, 15 - page * 3 - day, 12, row),
      ),
];

/// Holds the loaded pages like the section does: one request at a time,
/// appended with duplicates.
class _Pager extends StatefulWidget {
  const _Pager({required this.pages, required this.onRequest, this.filter});

  final int pages;
  final VoidCallback onRequest;
  final ProfileTimelineFilter? filter;

  @override
  State<_Pager> createState() => _PagerState();
}

class _PagerState extends State<_Pager> {
  var _loaded = 1;
  var _loading = false;
  late List<ProfileTimelineItem> _items = _page(0);

  void complete() => setState(() {
    _loading = false;
    // The next page repeats the last row of the previous one.
    _items = [..._items, _items.last, ..._page(_loaded)];
    _loaded++;
  });

  @override
  Widget build(BuildContext context) => ProfileTimelineView(
    items: _items,
    now: _now,
    filter: widget.filter ?? const ProfileTimelineFilter(),
    onFilterChanged: (_) {},
    onOpen: (_) {},
    hasMore: _loaded < widget.pages,
    loadingMore: _loading,
    onLoadMore: () {
      if (_loading) return;
      widget.onRequest();
      setState(() => _loading = true);
    },
  );
}

void main() {
  test('real IANA zones group UTC boundaries and DST by calendar day', () {
    tzdata.initializeTimeZones();
    final saigon = tz.getLocation('Asia/Ho_Chi_Minh');
    final ny = tz.getLocation('America/New_York');
    DateTime vietnam(DateTime value) => tz.TZDateTime.from(value, saigon);
    DateTime newYork(DateTime value) => tz.TZDateTime.from(value, ny);
    final source = [
      _item('UTC evening', DateTime.utc(2026, 9, 30, 18)),
      _item('UTC morning', DateTime.utc(2026, 10, 1, 1)),
    ];
    expect(groupProfileTimelineDays(source, convertDate: vietnam).keys, [
      DateTime(2026, 10),
    ]);
    expect(groupProfileTimelineDays(source, convertDate: newYork).keys, [
      DateTime(2026, 9, 30),
    ]);
    final dst = [
      _item('first 1:30', DateTime.utc(2026, 11, 1, 5, 30)),
      _item('second 1:30', DateTime.utc(2026, 11, 1, 6, 30)),
    ];
    final days = groupProfileTimelineDays(dst, convertDate: newYork);
    expect(days.keys, [DateTime(2026, 11)]);
    expect(days.values.single.map((row) => row.id), [
      'second 1:30',
      'first 1:30',
    ]);
  });

  testWidgets('paging is incremental, deduplicated and stops at the end', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var requests = 0;
    await tester.pumpApp(_Pager(pages: 3, onRequest: () => requests++));
    await tester.pump();
    final pager = tester.state<_PagerState>(find.byType(_Pager));
    final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
    // Repeated notifications in one frame ask for one page.
    scroll.position.jumpTo(scroll.position.maxScrollExtent - 100);
    scroll.position.jumpTo(scroll.position.maxScrollExtent);
    await tester.pump();
    expect(requests, 1);
    expect(find.byKey(const ValueKey('timeline-loading-more')), findsOneWidget);
    pager.complete();
    await tester.pump();
    final duplicate = _page(0).last;
    expect(
      find.byKey(
        ValueKey('timeline-row-${duplicate.type}:${duplicate.id}'),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
    for (var i = 0; i < 4; i++) {
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump();
      if (pager._loading) pager.complete();
      await tester.pump();
    }
    expect(requests, 2);
    expect(find.byKey(const ValueKey('timeline-load-more')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a filter waits for Load more instead of paging on its own', (
    tester,
  ) async {
    var requests = 0;
    await tester.pumpApp(
      _Pager(
        pages: 5,
        onRequest: () => requests++,
        filter: const ProfileTimelineFilter(query: 'no such activity'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(requests, 0);
    expect(find.byKey(const ValueKey('timeline-filtered-empty')), findsOne);
    await tester.tap(find.byKey(const ValueKey('timeline-load-more')));
    await tester.pump();
    expect(requests, 1);
    expect(find.byKey(const ValueKey('timeline-loading-more')), findsOneWidget);
    tester.state<_PagerState>(find.byType(_Pager)).complete();
    await tester.pump();
    await tester.pump();
    expect(requests, 1);
    expect(find.byKey(const ValueKey('timeline-load-more')), findsOneWidget);
  });

  testWidgets('rows open from assistive technology and meet 44dp', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final opened = <String>[];
    await tester.pumpApp(
      ProfileTimelineView(
        items: [
          _item('Titled', DateTime(2026, 10, 15, 9)),
          _item('untitled', DateTime(2026, 10, 15, 8), title: ''),
        ],
        now: _now,
        onOpen: (item) => opened.add(item.id),
      ),
    );
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('timeline-row-task:untitled'));
    final data = tester.getSemantics(row).getSemanticsData();
    expect(data.hasAction(SemanticsAction.tap), isTrue);
    expect(data.flagsCollection.isButton, isTrue);
    tester.semantics.tap(find.semantics.byLabel(RegExp('^Task, ')));
    expect(opened, ['untitled']);
    final card = find.descendant(of: row, matching: find.byType(InkWell));
    expect(tester.getSize(card).height, greaterThanOrEqualTo(44));
    semantics.dispose();
  });

  testWidgets('320px at 3x text renders rows without overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 3;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpApp(
      ProfileTimelineView(
        items: [
          _item(
            'A very long activity title that wraps across lines',
            DateTime(2026, 10, 15, 23, 58),
          ),
          _item('untitled', DateTime(2026, 10, 14, 7), title: ''),
        ],
        now: _now,
        onFilterChanged: (_) {},
        onOpen: (_) {},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('timeline-row-task:untitled')), findsOne);
    expect(tester.takeException(), isNull);
  });
}
