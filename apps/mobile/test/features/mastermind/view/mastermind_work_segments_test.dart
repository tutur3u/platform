import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

import '../../../helpers/mastermind_work_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

final List<Map<String, dynamic>> _lanes = [
  workLane(1, title: 'Old running', ageSeconds: 9000),
  workLane(2, state: 'failed', title: 'Broken lane', product: 'Mastermind'),
];

final List<Map<String, dynamic>> _backlog = [
  backlogRow(1, state: 'answered', title: 'Answered tuturuuu item'),
  backlogRow(2, title: 'Open tuturuuu item'),
  backlogRow(3, state: 'withdrawn', title: 'Withdrawn tuturuuu item'),
  backlogRow(4, title: 'Mastermind item', product: 'Mastermind'),
  backlogRow(5, title: 'Loose item', product: null),
];

final List<Map<String, dynamic>> _staff = [
  staffRow('Writer', state: 'idle', title: 'Writer desk'),
  staffRow('Reviewer', title: 'Reviewer desk', model: 'codex / gpt-5'),
  staffRow('Architect', state: 'failed', title: 'Architect desk'),
  staffRow('Builder', title: 'Builder desk', model: 'unknown'),
  staffRow('analyst', title: 'Analyst desk', state: 'idle'),
];

Map<String, dynamic> _json() =>
    workJson(_lanes, backlog: _backlog, staff: _staff);

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

Iterable<String> _allText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((t) => t.data ?? '')
    .where((t) => t.isNotEmpty);

Future<void> _segment(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).first);
  await tester.pumpAndSettle();
}

void main() {
  group('segment control', () {
    testWidgets('offers Lanes, Backlog and Staff, starting on Lanes', (
      tester,
    ) async {
      await pumpWork(tester, _json());
      for (final label in ['Lanes', 'Backlog', 'Staff']) {
        expect(find.text(label), findsOneWidget, reason: label);
      }
      expect(find.text('Old running'), findsOneWidget);
      expect(find.text('Open tuturuuu item'), findsNothing);
      expect(find.text('Writer desk'), findsNothing);
    });

    testWidgets('switches the list without a page of its own', (tester) async {
      await pumpWork(tester, _json());
      await _segment(tester, 'Backlog');
      expect(find.text('Open tuturuuu item'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
      await _segment(tester, 'Staff');
      expect(find.text('Writer desk'), findsOneWidget);
      expect(find.text('Open tuturuuu item'), findsNothing);
      await _segment(tester, 'Lanes');
      expect(find.text('Old running'), findsOneWidget);
    });

    testWidgets('keeps the segment in the URL, Lanes being the bare tab', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, _json(), router: router);
      String location() => workUri(router).toString();

      await _segment(tester, 'Backlog');
      expect(location(), '${Routes.mastermindWork}?segment=backlog');
      await _segment(tester, 'Staff');
      expect(location(), '${Routes.mastermindWork}?segment=staff');
      await _segment(tester, 'Lanes');
      expect(location(), Routes.mastermindWork);
    });

    testWidgets('keeps the lane filters in the URL across segments', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, _json(), router: router);
      await tester.tap(find.widgetWithText(AppChip, '1 failed'));
      await tester.pumpAndSettle();
      await _segment(tester, 'Staff');
      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?segment=staff&state=failed',
      );
      await _segment(tester, 'Lanes');
      expect(workUri(router).queryParameters['state'], 'failed');
      expect(find.text('Old running'), findsNothing);
      expect(find.text('Broken lane'), findsOneWidget);
    });

    testWidgets('opens on the segment the URL names', (tester) async {
      for (final (query, expected) in [
        ('backlog', 'Open tuturuuu item'),
        ('staff', 'Writer desk'),
        ('lanes', 'Old running'),
        ('nonsense', 'Old running'),
      ]) {
        final router = workRouter('${Routes.mastermindWork}?segment=$query');
        await pumpWork(tester, _json(), router: router);
        expect(find.text(expected), findsOneWidget, reason: query);
      }
    });

    testWidgets('follows a new segment while the page is open', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, _json(), router: router);
      router.go('${Routes.mastermindWork}?segment=staff');
      await tester.pumpAndSettle();
      expect(find.text('Writer desk'), findsOneWidget);
      router.go(Routes.mastermindWork);
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsOneWidget);
    });

    testWidgets('a lane pushed over the Lanes segment pops back to it', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, _json(), router: router);
      await _segment(tester, 'Backlog');
      await _segment(tester, 'Lanes');
      await tester.tap(find.text('Broken lane'));
      await tester.pumpAndSettle();
      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(workUri(router).path, Routes.mastermindWork);
    });

    test('a deep link to a segment opens the tab root', () {
      for (final path in [
        'personal/mastermind/work?segment=staff',
        'personal/mastermind/work?segment=backlog',
      ]) {
        final link = resolveMobileDeepLink(
          Uri.parse('https://tuturuuu.com/$path'),
        );
        expect(link?.location, Routes.mastermindWork, reason: path);
      }
    });

    test('workLocation writes only a segment other than Lanes', () {
      expect(workLocation(), Routes.mastermindWork);
      expect(
        workLocation(segment: WorkSegment.backlog),
        '${Routes.mastermindWork}?segment=backlog',
      );
      expect(workSegmentFromQuery('staff'), WorkSegment.staff);
      expect(workSegmentFromQuery(null), WorkSegment.lanes);
    });
  });

  group('backlog', () {
    testWidgets('groups by product, open first, with a count', (tester) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      final order = [
        'Open tuturuuu item',
        'Answered tuturuuu item',
        'Withdrawn tuturuuu item',
      ];
      final tops = [for (final title in order) _top(tester, title)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(find.text('3'), findsOneWidget); // three Tuturuuu items
      expect(find.text('Mastermind'), findsOneWidget); // its group
    });

    testWidgets('states read as a word, never colour alone', (tester) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      for (final word in ['open', 'answered', 'withdrawn']) {
        expect(find.text(word), findsWidgets, reason: word);
      }
    });

    testWidgets('puts an item with no product last, under its own caption', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      expect(find.text('No product'), findsOneWidget);
      expect(
        _top(tester, 'No product') > _top(tester, 'Withdrawn tuturuuu item'),
        isTrue,
      );
    });

    testWidgets('search narrows by title, with its own placeholder', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      expect(find.text('Search backlog'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'loose');
      await tester.pumpAndSettle();
      expect(find.text('Loose item'), findsOneWidget);
      expect(find.text('Open tuturuuu item'), findsNothing);
      await tester.enterText(find.byType(TextField), 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('No matching backlog items'), findsOneWidget);
    });

    testWidgets('is clear when there are no items', (tester) async {
      await pumpWork(
        tester,
        workJson(_lanes, staff: _staff),
        segment: WorkSegment.backlog,
      );
      expect(find.text('Backlog is clear'), findsOneWidget);
      expect(find.byType(AppSearchField), findsNothing);
    });

    testWidgets('shows no id and no tap target on a row', (tester) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      expect(_allText(tester).where((t) => t.contains('item-')), isEmpty);
      for (final row in tester.widgetList<AppGroupedRow>(
        find.byType(AppGroupedRow),
      )) {
        expect(row.onTap, isNull);
      }
    });

    testWidgets('keeps the security line redacted, uncounted and unsearched', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.backlog);
      expect(find.text('Security'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(
        _top(tester, 'Security') > _top(tester, 'Loose item'),
        isTrue,
        reason: 'trailing group',
      );
      await tester.enterText(find.byType(TextField), 'security');
      await tester.pumpAndSettle();
      expect(find.text('No matching backlog items'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
    });

    testWidgets('lists only the security line when that is all there is', (
      tester,
    ) async {
      await pumpWork(
        tester,
        workJson(const [], staff: const []),
        segment: WorkSegment.backlog,
      );
      expect(find.text('Backlog is clear'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
    });
  });

  group('staff', () {
    testWidgets('sorts by state priority, then role', (tester) async {
      await pumpWork(tester, _json(), segment: WorkSegment.staff);
      final order = [
        'Architect desk', // failed
        'Builder desk', // running, Builder
        'Reviewer desk', // running, Reviewer
        'Analyst desk', // idle, analyst (case-insensitive)
        'Writer desk', // idle, Writer
      ];
      final tops = [for (final title in order) _top(tester, title)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
    });

    testWidgets('summarises the roles and how many are running', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.staff);
      expect(find.text('5 roles · 2 running'), findsOneWidget);
    });

    testWidgets('reads one role in the singular', (tester) async {
      await pumpWork(
        tester,
        workJson(const [], staff: [staffRow('Lead', state: 'idle')]),
        segment: WorkSegment.staff,
      );
      expect(find.text('1 role · 0 running'), findsOneWidget);
    });

    testWidgets('shows title, role, model and a state word per row', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.staff);
      expect(find.text('Reviewer · codex / gpt-5'), findsOneWidget);
      expect(find.text('failed'), findsOneWidget);
      expect(find.text('Builder · Unknown model'), findsOneWidget);
    });

    testWidgets('says nothing about activity: no last-active, runs or today', (
      tester,
    ) async {
      await pumpWork(tester, _json(), segment: WorkSegment.staff);
      final text = _allText(tester).join(' | ').toLowerCase();
      for (final word in ['last active', 'runs', 'today', 'active', 'ago']) {
        expect(text, isNot(contains(word)), reason: word);
      }
      // No sort control, no search field and no filter chips either.
      expect(find.byType(AppChip), findsNothing);
      expect(find.byType(AppSearchField), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('keeps its order whatever order the hub sent', (tester) async {
      final reversed = _staff.reversed.toList();
      await pumpWork(
        tester,
        workJson(_lanes, staff: reversed),
        segment: WorkSegment.staff,
      );
      expect(
        _top(tester, 'Architect desk') < _top(tester, 'Writer desk'),
        isTrue,
      );
      expect(
        _top(tester, 'Builder desk') < _top(tester, 'Reviewer desk'),
        isTrue,
      );
    });

    testWidgets('says so when no roles are reported', (tester) async {
      await pumpWork(
        tester,
        workJson(_lanes, staff: const []),
        segment: WorkSegment.staff,
      );
      expect(find.text('No staff roles reported.'), findsOneWidget);
    });
  });

  group('layout', () {
    testWidgets('the last row of every segment clears the dock', (
      tester,
    ) async {
      for (final segment in [WorkSegment.backlog, WorkSegment.staff]) {
        const height = 800.0;
        const dock = 120.0;
        await pumpWork(
          tester,
          _json(),
          segment: segment,
          size: const Size(430, height),
          dockClearance: dock,
        );
        await tester.drag(
          find.byType(CustomScrollView),
          const Offset(0, -3000),
        );
        await tester.pumpAndSettle();
        final last = tester.getRect(find.byType(AppGroupedRow).last);
        expect(
          last.bottom,
          lessThanOrEqualTo(height - dock),
          reason: '$segment',
        );
      }
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      for (final segment in WorkSegment.values) {
        await pumpWork(tester, _json(), segment: segment);
        expect(find.byType(AppBar), findsNothing);
        expect(find.byType(BackButton), findsNothing);
      }
    });
  });
}
