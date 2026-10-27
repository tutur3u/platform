import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Future<MastermindViewHarness> _pump(
  WidgetTester tester, {
  TestAccess access = TestAccess.enabled,
  FakeHubSource? source,
  void Function()? afterAccess,
}) async {
  final harness = MastermindViewHarness(source: source);
  addTearDown(harness.dispose);
  await harness.setAccess(access);
  afterAccess?.call();
  await tester.pumpApp(
    harness.wrap(
      MastermindSection(
        builder: (context, ready, freshness) => const Text('content'),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

SnapshotFetch _unavailable(SnapshotUnavailableKind kind) =>
    SnapshotFetch.unavailable(kind);

void main() {
  group('access gate', () {
    for (final mode in [
      TestAccess.loading,
      TestAccess.disabled,
      TestAccess.error,
    ]) {
      testWidgets('${mode.name} shows no content and loads nothing', (
        tester,
      ) async {
        final harness = await _pump(tester, access: mode);
        expect(find.text('content'), findsNothing);
        expect(find.byType(MastermindSkeleton), findsOneWidget);
        expect(harness.source.calls, 0);
        expect(harness.scheduler.isScheduled, isFalse);
      });
    }

    testWidgets('enabled access loads and shows the snapshot', (tester) async {
      final harness = await _pump(tester);
      expect(find.text('content'), findsOneWidget);
      expect(harness.source.calls, 1);
      expect(harness.snapshot.state, isA<MastermindSnapshotReady>());
    });

    testWidgets('losing access hides content and erases the cache', (
      tester,
    ) async {
      final harness = await _pump(tester);
      expect(await harness.store.read(), isNotNull);

      await harness.setAccess(TestAccess.disabled);
      await tester.pumpAndSettle();

      expect(find.text('content'), findsNothing);
      expect(harness.snapshot.state, isA<MastermindSnapshotInitial>());
      expect(await harness.store.read(), isNull);
    });
  });

  group('scheduler lifetime', () {
    testWidgets('attaches with the screen and detaches when it closes', (
      tester,
    ) async {
      final harness = await _pump(tester);
      expect(harness.scheduler.isScheduled, isTrue);

      await tester.pumpWidget(const SizedBox.shrink());
      expect(harness.scheduler.isScheduled, isFalse);
    });
  });

  group('whole-section states', () {
    testWidgets('loading with nothing held shows skeleton cards', (
      tester,
    ) async {
      final source = FakeHubSource()
        ..fetcher = () => Completer<SnapshotFetch>().future;
      await _pump(tester, source: source);
      expect(find.byType(MastermindSkeleton), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('content'), findsNothing);
    });

    testWidgets('not configured says so and offers no retry', (tester) async {
      final source = FakeHubSource();
      // Access only enables for a configured source, so flip it afterwards:
      // the cubit must still honour what the source says at fetch time.
      await _pump(
        tester,
        source: source,
        afterAccess: () => source.configured = false,
      );
      expect(
        find.text("Mastermind isn't connected on this build."),
        findsOneWidget,
      );
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets('unauthorized asks to sign in again', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            _unavailable(SnapshotUnavailableKind.unauthorized);
      await _pump(tester, source: source);
      expect(find.text('Sign in again to view Mastermind'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
    });

    testWidgets(
      'forbidden explains itself and hides the entry, not the screen',
      (tester) async {
        final source = FakeHubSource()
          ..fetcher = () async =>
              _unavailable(SnapshotUnavailableKind.forbidden);
        final harness = await _pump(tester, source: source);
        expect(
          find.text("This account isn't allowed to view Mastermind."),
          findsOneWidget,
        );
        expect(find.text('Retry'), findsNothing);
        expect(harness.access.state.forbidden, isTrue);
        expect(harness.access.state.visible, isFalse);
        expect(harness.access.state.enabled, isTrue);
        expect(await harness.store.read(), isNull);
      },
    );

    testWidgets('no snapshot yet offers a retry', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            _unavailable(SnapshotUnavailableKind.noSnapshot);
      await _pump(tester, source: source);
      expect(find.text("Mastermind hasn't published yet."), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('unavailable retries on demand', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            _unavailable(SnapshotUnavailableKind.unavailable);
      await _pump(tester, source: source);
      expect(find.text("Can't reach Mastermind."), findsOneWidget);
      final before = source.calls;

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(source.calls, greaterThan(before));
    });

    testWidgets('an unsupported schema offers retry and says to update', (
      tester,
    ) async {
      final json = homeJson()..['schema_version'] = '1.3';
      await _pump(tester, source: FakeHubSource(bytes: snapshotBytes(json)));
      expect(find.text("This snapshot can't be shown"), findsOneWidget);
      expect(
        find.text(
          "It uses a format this app version doesn't read. Update the app.",
        ),
        findsOneWidget,
      );
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('other rejections show a category, never the debug path', (
      tester,
    ) async {
      final json = homeJson()..['leaked_field_name'] = 1;
      await _pump(tester, source: FakeHubSource(bytes: snapshotBytes(json)));
      expect(find.text("The latest update couldn't be read."), findsOneWidget);
      final texts = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data ?? '')
          .join('\n');
      expect(texts, isNot(contains('leaked_field_name')));
      expect(texts, isNot(contains('/')));
    });

    testWidgets('garbage bytes are rejected the same way', (tester) async {
      await _pump(
        tester,
        source: FakeHubSource(bytes: Uint8List.fromList(utf8.encode('{'))),
      );
      expect(find.text("The latest update couldn't be read."), findsOneWidget);
    });
  });
}
