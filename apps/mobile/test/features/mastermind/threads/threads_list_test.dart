import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/threads/threads_location.dart';
import 'package:mobile/features/mastermind/threads/threads_segmented_control.dart';
import 'package:mobile/features/mastermind/view/work/lane_tile.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/features/mastermind/view/work/work_staff_section.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

/// The exact redacted Forge v1 publisher sample #7170 verifies.
final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

Map<String, dynamic> _v1() =>
    jsonDecode(_fixture.readAsStringSync()) as Map<String, dynamic>;

final List<Map<String, dynamic>> _mixed = [
  workLane(1, title: 'Running lane', ageSeconds: 600),
  workLane(2, state: 'idle', title: 'Idle lane', ageSeconds: 60),
  workLane(
    3,
    state: 'failed',
    title: 'Broken lane',
    product: 'Mastermind',
    ageSeconds: 30,
  ),
  workLane(4, state: 'waiting', title: 'Waiting lane', ageSeconds: 90),
  workLane(5, state: 'queued', title: 'Queued lane', ageSeconds: 120),
  workLane(6, state: 'failed', title: 'Old broken lane', ageSeconds: 9000),
];

Future<MastermindViewHarness> _pump(
  WidgetTester tester, {
  Map<String, dynamic>? json,
  FakeHubSource? source,
  Size size = const Size(430, 4000),
  double dock = 0,
  WorkSegment segment = WorkSegment.lanes,
}) async {
  workSurface(tester, size);
  final harness = MastermindViewHarness(
    source: source ?? FakeHubSource(bytes: snapshotBytes(json ?? _v1())),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: EdgeInsets.only(bottom: dock)),
          child: MastermindThreadsPage(initialSegment: segment),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

List<String> _titles(WidgetTester tester) => [
  for (final tile in tester.widgetList<LaneTile>(find.byType(LaneTile)))
    tile.lane.title,
];

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

void main() {
  setUpAll(initializeDateFormatting);
  setUp(() => debugOverrideMastermindThreads(enabled: true));
  tearDown(() => debugOverrideMastermindThreads(enabled: null));

  test('threadsLocation carries the segment and every Work filter', () {
    expect(threadsLocation(), '/mastermind/threads');
    expect(
      threadsLocation(segment: WorkSegment.staff, state: LaneState.waiting),
      '/mastermind/threads?segment=staff&state=waiting',
    );
    expect(
      threadsLocation(state: LaneState.failed, product: Product.mastermind),
      '/mastermind/threads?state=failed&product=Mastermind',
    );
  });

  group('MastermindThreadsPage lanes', () {
    testWidgets('renders the v1 sample through the shared snapshot', (
      tester,
    ) async {
      final harness = await _pump(tester);
      expect(tester.takeException(), isNull);
      expect(_titles(tester), ['[Atlas] Mastermind']);
      expect(find.text('1 idle'), findsOneWidget);
      // One shared snapshot read: the list never fetches or parses on its own.
      expect(harness.source.calls, 1);
    });

    testWidgets('groups Waiting, Failed, Running, Idle, oldest first', (
      tester,
    ) async {
      await _pump(tester, json: workJson(_mixed));
      final order = [
        'Waiting lane',
        'Old broken lane',
        'Broken lane',
        'Running lane',
        'Queued lane',
        'Idle lane',
      ];
      final tops = [for (final title in order) _top(tester, title)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
      // The state chips follow the same order.
      final positions = [
        for (final label in [
          '1 waiting',
          '2 failed',
          '1 running',
          '1 queued',
          '1 idle',
        ])
          tester.getTopLeft(find.widgetWithText(AppChip, label)),
      ];
      final reading = [...positions]
        ..sort(
          (a, b) => a.dy != b.dy ? a.dy.compareTo(b.dy) : a.dx.compareTo(b.dx),
        );
      expect(positions, reading);
    });

    testWidgets('the state chips filter, and All clears them', (tester) async {
      await _pump(tester, json: workJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, '2 failed'));
      await tester.pumpAndSettle();
      expect(_titles(tester), ['Old broken lane', 'Broken lane']);
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(_titles(tester), hasLength(6));
    });

    testWidgets('product filters stay, and Clear filters resets them', (
      tester,
    ) async {
      await _pump(tester, json: workJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(_titles(tester), ['Broken lane']);
      await tester.enterText(find.byType(EditableText), 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('No matching lanes'), findsOneWidget);
      await tester.tap(find.text('Clear filters'));
      await tester.pumpAndSettle();
      expect(find.text('No matching lanes'), findsNothing);
      expect(_titles(tester), hasLength(6));
    });

    testWidgets('no lanes at all is not a no-match', (tester) async {
      await _pump(tester, json: workJson(const [], security: false));
      expect(find.text('No lanes right now'), findsOneWidget);
      expect(find.text('Clear filters'), findsNothing);
    });

    testWidgets('Backlog and Staff read the same shared snapshot', (
      tester,
    ) async {
      final harness = await _pump(tester);
      await tester.tap(find.text('Backlog'));
      await tester.pumpAndSettle();
      expect(find.byType(WorkBacklogSection), findsOneWidget);
      expect(find.byType(LaneTile), findsNothing);
      await tester.tap(find.text('Staff'));
      await tester.pumpAndSettle();
      expect(find.byType(WorkStaffSection), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Threads').first);
      await tester.pumpAndSettle();
      expect(_titles(tester), ['[Atlas] Mastermind']);
      expect(harness.source.calls, 1);
    });

    testWidgets('segments, chips and rows keep 44 pt targets', (tester) async {
      await _pump(tester);
      final control = find.byType(ThreadsSegmentedControl<WorkSegment>);
      for (final label in ['Threads', 'Backlog', 'Staff']) {
        final segment = find.descendant(
          of: control,
          matching: find.ancestor(
            of: find.text(label),
            matching: find.byType(GestureDetector),
          ),
        );
        expect(tester.getSize(segment.first).height, greaterThanOrEqualTo(44));
      }
      for (final chip in ['All', '1 idle']) {
        final size = tester.getSize(
          find.ancestor(of: find.text(chip), matching: find.byType(AppChip)),
        );
        expect(size.height, greaterThanOrEqualTo(44), reason: chip);
      }
      expect(
        tester.getSize(find.byType(LaneTile)).height,
        greaterThanOrEqualTo(44),
      );
    });

    testWidgets('the last thread clears the dock', (tester) async {
      const height = 800.0;
      const dock = 120.0;
      await _pump(
        tester,
        json: workJson([
          for (var i = 1; i <= 12; i++) workLane(i, title: 'Lane $i'),
        ]),
        size: const Size(430, height),
        dock: dock,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -6000));
      await tester.pumpAndSettle();
      final last = find.byType(LaneTile).last;
      expect(tester.getRect(last).bottom, lessThanOrEqualTo(height - dock));
      expect(last.hitTestable(), findsOneWidget);
    });

    testWidgets('a rate-limited refresh keeps the listed threads', (
      tester,
    ) async {
      final harness = await _pump(tester);
      // The hub source maps 429 to `unavailable`; the last snapshot stays.
      harness.source.fetcher = () async =>
          const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(_titles(tester), ['[Atlas] Mastermind']);
      expect(harness.source.calls, 2);
    });

    testWidgets('a 404 with nothing published shows the shared state', (
      tester,
    ) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            const SnapshotFetch.unavailable(SnapshotUnavailableKind.noSnapshot);
      await _pump(tester, source: source);
      expect(find.text("Mastermind hasn't published yet"), findsOneWidget);
      expect(find.byType(LaneTile), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('has no send UI', (tester) async {
      await _pump(tester, json: workJson(_mixed));
      expect(find.byType(EditableText), findsOneWidget); // search only
      expect(find.byIcon(Icons.send), findsNothing);
    });
  });
}
