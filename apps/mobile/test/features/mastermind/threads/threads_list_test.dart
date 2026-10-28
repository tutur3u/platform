import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_list_model.dart';
import 'package:mobile/features/mastermind/threads/threads_segmented_control.dart';
import 'package:mobile/features/mastermind/view/work/lane_tile.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/features/mastermind/view/work/work_staff_section.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';

/// The exact redacted Forge v1 publisher sample #7170 verifies.
final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

Map<String, dynamic> _v1() =>
    jsonDecode(_fixture.readAsStringSync()) as Map<String, dynamic>;

/// The v1 sample plus [extra] lanes shaped like its own lane row: `name`,
/// `role`, a `[Name] Role` title, `status`, `top_level`, and a `work.lanes[]`
/// companion. A lane without `status` keeps its legacy `state`.
Map<String, dynamic> _v1With(
  List<(String name, String role, String status)> extra,
) {
  final json = _v1();
  final lanes = json['lanes'] as List<dynamic>;
  final work = json['work'] as Map<String, dynamic>;
  final companions = work['lanes'] as List<dynamic>;
  final template = Map<String, dynamic>.from(lanes.single as Map);
  for (var i = 0; i < extra.length; i++) {
    final (name, role, status) = extra[i];
    final id = 'item-${(i + 1).toRadixString(16).padLeft(20, 'a')}';
    lanes.add(
      {
        ...template,
        'id': id,
        'name': name,
        'role': role,
        'title': '[$name] $role',
        'top_level': false,
        'state': status,
        'status': status,
      }..removeWhere((key, _) => key == 'status' && status == 'queued'),
    );
    companions.add({'id': id, if (status != 'queued') 'status': status});
  }
  return json;
}

MastermindSnapshot _parse(Map<String, dynamic> json) {
  final outcome = parseMastermindSnapshot(snapshotBytes(json));
  expect(
    outcome,
    isA<ParseAccepted>(),
    reason: outcome is ParseRejected ? outcome.path : null,
  );
  return (outcome as ParseAccepted).snapshot;
}

Future<MastermindViewHarness> _pump(
  WidgetTester tester, {
  Map<String, dynamic>? json,
  FakeHubSource? source,
  Size size = const Size(430, 4000),
  double dock = 0,
  WorkSegment segment = WorkSegment.lanes,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
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

void main() {
  setUpAll(initializeDateFormatting);

  group('ThreadsListModel', () {
    test('lists the v1 sample through the shared snapshot parser', () {
      final model = ThreadsListModel.from(_parse(_v1()));
      expect(model.lanes.single.id, 'item-cccccccccccccccccccc');
      expect(model.lanes.single.title, '[Atlas] Mastermind');
      expect(model.lanes.single.role, 'Mastermind');
      expect(model.lanes.single.state, LaneState.idle);
      expect(model.counts, {
        LaneState.running: 0,
        LaneState.waiting: 0,
        LaneState.idle: 1,
        LaneState.failed: 0,
      });
      expect(model.statuses(null), [
        LaneState.running,
        LaneState.waiting,
        LaneState.idle,
      ]);
    });

    test('counts come from work.counts, not the listed lanes', () {
      final json = _v1();
      (json['work'] as Map<String, dynamic>)['counts'] = {
        'running': 8,
        'waiting': 3,
        'idle': 2,
      };
      final model = ThreadsListModel.from(_parse(json));
      expect(model.total, 1);
      expect(model.counts[LaneState.running], 8);
      expect(model.counts[LaneState.waiting], 3);
      expect(model.counts[LaneState.idle], 2);
    });

    test('filters by status group and searches title and role', () {
      final snapshot = _parse(
        _v1With([
          ('Bolt', 'Builder', 'running'),
          ('Cedar', 'Reviewer', 'waiting'),
          ('Dune', 'Builder', 'queued'),
          ('Ember', 'Builder', 'failed'),
        ]),
      );
      List<String> titles({String query = '', LaneState? status}) => [
        for (final lane in ThreadsListModel.from(
          snapshot,
          query: query,
          status: status,
        ).lanes)
          lane.title,
      ];
      expect(titles(), hasLength(5));
      expect(titles(status: LaneState.running), [
        '[Bolt] Builder',
        '[Dune] Builder',
      ]);
      expect(titles(status: LaneState.waiting), ['[Cedar] Reviewer']);
      expect(titles(status: LaneState.idle), ['[Atlas] Mastermind']);
      expect(titles(status: LaneState.failed), ['[Ember] Builder']);
      expect(titles(query: 'REVIEW'), ['[Cedar] Reviewer']);
      expect(titles(query: 'builder', status: LaneState.running), [
        '[Bolt] Builder',
        '[Dune] Builder',
      ]);
      expect(titles(query: 'nothing'), isEmpty);
      final model = ThreadsListModel.from(snapshot);
      // Published work.counts win; failed is derived and offered when present.
      expect(model.counts[LaneState.idle], 1);
      expect(model.counts[LaneState.failed], 1);
      expect(model.statuses(null), contains(LaneState.failed));
    });

    test('a queued Home or Work link filters the running group', () {
      expect(threadStatusFromQuery('queued'), LaneState.running);
      expect(threadStatusFromQuery('idle'), LaneState.idle);
      expect(threadStatusFromQuery('bogus'), isNull);
      expect(
        threadsLocation(segment: WorkSegment.staff, status: LaneState.waiting),
        '/mastermind/threads?segment=staff&state=waiting',
      );
      expect(threadsLocation(), '/mastermind/threads');
    });
  });

  group('MastermindThreadsPage', () {
    testWidgets('renders the v1 sample with titles, counts and filters', (
      tester,
    ) async {
      final harness = await _pump(tester);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('item-cccccccccccccccccccc')), findsOne);
      expect(_titles(tester), ['[Atlas] Mastermind']);
      expect(find.text('1 idle'), findsOneWidget);
      expect(find.text('0 running'), findsOneWidget);
      expect(find.text('0 waiting'), findsOneWidget);
      await tester.tap(find.text('0 running'));
      await tester.pumpAndSettle();
      expect(_titles(tester), isEmpty);
      expect(find.text('No matching threads'), findsOneWidget);
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(EditableText), 'atlas');
      await tester.pumpAndSettle();
      expect(_titles(tester), ['[Atlas] Mastermind']);
      await tester.enterText(find.byType(EditableText), 'zzz');
      await tester.pumpAndSettle();
      expect(_titles(tester), isEmpty);
      // One shared snapshot read: the list never fetches or parses on its own.
      expect(harness.source.calls, 1);
    });

    testWidgets('Backlog and Staff read the same shared snapshot', (
      tester,
    ) async {
      final harness = await _pump(tester);
      await tester.tap(find.text('Backlog'));
      await tester.pumpAndSettle();
      expect(find.byType(WorkBacklogSection), findsOneWidget);
      expect(find.text('Backlog is clear'), findsOneWidget);
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
      for (final chip in ['All', '1 idle', '0 running']) {
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
        json: _v1With([
          for (var i = 0; i < 12; i++) ('Lane$i', 'Builder', 'running'),
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

    testWidgets('has no send UI and no history navigation', (tester) async {
      await _pump(tester);
      expect(find.byType(EditableText), findsOneWidget); // search only
      expect(find.byIcon(Icons.send), findsNothing);
      final tile = tester.widget<LaneTile>(find.byType(LaneTile));
      expect(
        Routes.mastermindWorkLanePath(tile.lane.id),
        isNot(contains('/threads/')),
      );
    });
  });
}
