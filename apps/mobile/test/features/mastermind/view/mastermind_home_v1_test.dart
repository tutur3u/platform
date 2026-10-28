import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/view/home/activity_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

Map<String, dynamic> _v1() =>
    jsonDecode(_fixture.readAsStringSync()) as Map<String, dynamic>;

String _hex(int n, int width) => n.toRadixString(16).padLeft(width, '0');

Map<String, dynamic> _ask(
  int n, {
  String title = 'Ask',
  String kind = 'action',
}) => {
  'id': 'item-${_hex(n, 20)}',
  'title': title,
  'body': 'Body',
  'options': <String>[],
  'recommended_option': null,
  'state': 'open',
  'kind': kind,
  'version_hash': _hex(n, 64),
};

Future<void> _pumpHome(
  WidgetTester tester,
  Map<String, dynamic> json, {
  Size size = const Size(430, 6000),
  double dock = 0,
  double textScale = 1,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            padding: EdgeInsets.only(bottom: dock),
            textScaler: TextScaler.linear(textScale),
          ),
          child: const MastermindHomePage(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

Finder _tile(String label) => find.descendant(
  of: find.byType(MastermindCountTile),
  matching: find.text(label),
);

void main() {
  setUpAll(initializeDateFormatting);

  group('Home on the Forge v1 fixture', () {
    testWidgets('counts come from work.counts, with waiting on you apart', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final json = _v1();
      (json['work'] as Map<String, dynamic>)['counts'] = {
        'running': 3,
        'waiting': 2,
        'idle': 13,
      };
      await _pumpHome(tester, json);
      expect(find.byType(MastermindCountTile), findsNWidgets(4));
      for (final label in ['Running', 'Waiting', 'Idle', 'Failed']) {
        expect(_tile(label), findsOneWidget);
      }
      expect(find.bySemanticsLabel('Running, 3'), findsOneWidget);
      // Two open decisions wait on the owner; FYI would not count.
      expect(find.bySemanticsLabel('Waiting, 2'), findsOneWidget);
      expect(find.bySemanticsLabel('Idle, 13'), findsOneWidget);
      expect(find.bySemanticsLabel('Failed, 0'), findsOneWidget);
      // The hub's own counts need no "from lane reports" caveat.
      expect(find.text('From lane reports'), findsNothing);
      handle.dispose();
    });

    testWidgets('names: a redacted triple becomes a sentence', (tester) async {
      final json = _v1();
      for (final list in [
        (json['now'] as Map<String, dynamic>)['needs_you'] as List<dynamic>,
        json['decisions'] as List<dynamic>,
      ]) {
        (list.first as Map<String, dynamic>)['title'] =
            'Mastermind · hub · decision';
      }
      await _pumpHome(tester, json);
      final first = ((json['now'] as Map)['needs_you'] as List).first as Map;
      expect(
        tester
            .widget<Text>(find.byKey(ValueKey('ask-title-${first['id']}')))
            .data,
        'Review the plan',
      );
      expect(find.textContaining('Mastermind · hub ·'), findsNothing);
      expect(find.text('Review plan'), findsOneWidget);
    });

    testWidgets('caps: three asks, three releases, three pools', (
      tester,
    ) async {
      final json = _v1();
      final now = json['now'] as Map<String, dynamic>;
      now['needs_you'] = [
        ...now['needs_you'] as List<dynamic>,
        for (var i = 1; i <= 3; i++) _ask(i, title: 'Extra ask $i'),
      ];
      (json['products'] as Map<String, dynamic>)['releases'] = [
        for (final (i, product) in [
          'Tuturuuu web',
          'Tuturuuu contacts',
          'Tuturuuu calendar',
          'Tuturuuu mobile',
          'Upskii',
        ].indexed)
          shipRelease(product, ageSeconds: 3600 * (i + 1)),
      ];
      await _pumpHome(tester, json);
      // Decisions first: the two open decisions, then one action.
      expect(find.text('Review plan'), findsNWidgets(2));
      expect(find.text('Extra ask 1'), findsOneWidget);
      expect(find.text('Extra ask 2'), findsNothing);
      expect(find.text('Show all 5'), findsNWidgets(2));
      // The most recent releases first, capped at three.
      expect(find.text('Tuturuuu web'), findsOneWidget);
      expect(find.text('Tuturuuu calendar'), findsOneWidget);
      expect(find.text('Tuturuuu mobile'), findsNothing);
      // All five share a basis, so it is said once, in the caption.
      expect(find.text('Ship · GitHub deployment'), findsOneWidget);
      expect(find.text('GitHub deployment'), findsNothing);
      // Seven pools in the fixture: the three most urgent, then Show all 7.
      expect(find.text('Show all 7'), findsOneWidget);
      // Hidden pools may report, so the capped list never collapses.
      expect(find.text('Quota not reported'), findsNothing);
      expect(find.text('Claude pool A'), findsOneWidget);
    });

    testWidgets('Not reported: missing readings are an em dash', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final json = _v1();
      (json['products'] as Map<String, dynamic>)['releases'] = [
        shipRelease('Upskii', ageSeconds: null),
        shipRelease('Tuturuuu web', ageSeconds: 60),
      ];
      await _pumpHome(tester, json);
      expect(find.text('—'), findsWidgets);
      // Merged into its row, the dash reads "Not reported" plus the reason.
      expect(find.bySemanticsLabel(RegExp('Not reported')), findsWidgets);
      // A release with no age sorts last.
      expect(
        tester.getTopLeft(find.text('Tuturuuu web')).dy,
        lessThan(tester.getTopLeft(find.text('Upskii')).dy),
      );
      final words = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data?.trim().toLowerCase());
      expect(words, isNot(contains('unknown')));
      expect(words, isNot(contains('not published yet')));
      handle.dispose();
    });

    testWidgets('lane-state fallback says where the counts came from', (
      tester,
    ) async {
      final json = _v1()..remove('work');
      await _pumpHome(tester, json);
      expect(find.text('From lane reports'), findsOneWidget);
    });
  });

  group('dock clearance', () {
    for (final scale in [1.0, 2.0]) {
      testWidgets('the last row clears the dock at text scale $scale', (
        tester,
      ) async {
        const size = Size(375, 667);
        const dock = 120.0;
        await _pumpHome(
          tester,
          homeJson(),
          size: size,
          dock: dock,
          textScale: scale,
        );
        await tester.drag(
          find.byType(CustomScrollView),
          const Offset(0, -20000),
        );
        await tester.pumpAndSettle();
        final last = find.byType(AppGroupedRow).last;
        final rect = tester.getRect(last);
        expect(rect.bottom, lessThanOrEqualTo(size.height - dock - 8));
        expect(last.hitTestable(), findsOneWidget);
      });
    }

    testWidgets('large text lays the counts out two by two', (tester) async {
      await _pumpHome(tester, homeJson(), textScale: 2);
      final running = tester.getTopLeft(find.byType(MastermindCountTile).first);
      final idle = tester.getTopLeft(find.byType(MastermindCountTile).at(2));
      expect(idle.dy, greaterThan(running.dy));
      expect(idle.dx, running.dx);
    });
  });
}
