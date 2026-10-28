import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';

// generated_at is 2026-01-31T17:30Z, which is 00:30 on 1 Feb in GMT+7. The
// visible line shows the short time; the full date is in the semantics.
const _time = 'Feb 1, 2026 00:30 GMT+7';
const _short = '00:30';

MastermindSnapshotReady _ready({
  SnapshotRefreshFailure? failure,
  List<Map<String, String>>? sources,
}) {
  final json = MastermindSnapshotBuilder.defaults().toJson();
  if (sources != null) json['sources'] = sources;
  return MastermindSnapshotReady(
    snapshot: parsedSnapshot(json),
    digest: 'a' * 64,
    origin: SnapshotOrigin.live,
    receivedAt: DateTime.utc(2026, 1, 31, 17, 31),
    refreshFailure: failure,
  );
}

void main() {
  final generatedAt = DateTime.utc(2026, 1, 31, 17, 30);

  group('MastermindFreshness.of', () {
    test('a recent snapshot is Updated, with no warning', () {
      final freshness = MastermindFreshness.of(
        _ready(),
        clock: () => generatedAt.add(const Duration(minutes: 2)),
      );
      expect(freshness.kind, MastermindFreshnessKind.updated);
      expect(freshness.isWarning, isFalse);
    });

    test('an aging or stale snapshot is only informational', () {
      for (final age in [
        const Duration(minutes: 10),
        const Duration(hours: 3),
      ]) {
        final freshness = MastermindFreshness.of(
          _ready(),
          clock: () => generatedAt.add(age),
        );
        expect(freshness.kind, MastermindFreshnessKind.lastPublished);
        expect(freshness.isWarning, isFalse);
      }
    });

    test('a failed refresh is a warning that wins over data age', () {
      DateTime clock() => generatedAt.add(const Duration(hours: 3));
      expect(
        MastermindFreshness.of(
          _ready(
            failure: const UnavailableRefresh(
              SnapshotUnavailableKind.unavailable,
            ),
          ),
          clock: clock,
        ).kind,
        MastermindFreshnessKind.couldntRefresh,
      );
      expect(
        MastermindFreshness.of(
          _ready(
            failure: const UnavailableRefresh(
              SnapshotUnavailableKind.unavailable,
            ),
          ),
          clock: clock,
          online: false,
        ).kind,
        MastermindFreshnessKind.offline,
      );
      expect(
        MastermindFreshness.of(
          _ready(
            failure: const RejectedRefresh(RejectionReason.unsupportedVersion),
          ),
          clock: clock,
        ).kind,
        MastermindFreshnessKind.updateApp,
      );
      expect(
        MastermindFreshness.of(
          _ready(
            failure: const RejectedRefresh(RejectionReason.schemaViolation),
          ),
          clock: clock,
        ).kind,
        MastermindFreshnessKind.unreadable,
      );
    });

    test('counts sources that are not ok', () {
      final freshness = MastermindFreshness.of(
        _ready(
          sources: [
            {'source': 'inbox', 'state': 'ok'},
            {'source': 'ci', 'state': 'stale'},
            {'source': 'github', 'state': 'missing'},
          ],
        ),
        clock: () => generatedAt,
      );
      expect(freshness.degradedSources, 2);
      expect(freshness.isWarning, isTrue);
    });
  });

  group('MastermindFreshnessStrip', () {
    Future<void> pumpStrip(
      WidgetTester tester,
      MastermindSnapshotReady ready,
      Duration age, {
      bool online = true,
      bool showWhenHealthy = true,
    }) => tester.pumpApp(
      Align(
        alignment: Alignment.topLeft,
        child: MastermindFreshnessStrip(
          showWhenHealthy: showWhenHealthy,
          freshness: MastermindFreshness.of(
            ready,
            clock: () => generatedAt.add(age),
            online: online,
          ),
        ),
      ),
    );

    testWidgets('fresh data reads Updated with the GMT+7 time', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpStrip(tester, _ready(), const Duration(minutes: 2));
      expect(find.text('Updated $_short'), findsOneWidget);
      expect(find.bySemanticsLabel('Updated $_time'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('healthy and fresh data hides the strip off Home', (
      tester,
    ) async {
      await pumpStrip(
        tester,
        _ready(),
        const Duration(minutes: 2),
        showWhenHealthy: false,
      );
      expect(find.textContaining('Updated'), findsNothing);
    });

    testWidgets('a warning shows on every tab', (tester) async {
      await pumpStrip(
        tester,
        _ready(
          sources: [
            {'source': 'ci', 'state': 'stale'},
          ],
        ),
        const Duration(minutes: 2),
        showWhenHealthy: false,
      );
      expect(find.textContaining('1 source degraded'), findsOneWidget);
    });

    testWidgets('old data shows on every tab too', (tester) async {
      await pumpStrip(
        tester,
        _ready(),
        const Duration(hours: 3),
        showWhenHealthy: false,
      );
      expect(find.text('Published 3 h ago'), findsOneWidget);
    });

    testWidgets('a warning tints the glyph and bar, never the text', (
      tester,
    ) async {
      await pumpStrip(
        tester,
        _ready(
          sources: [
            {'source': 'ci', 'state': 'stale'},
          ],
        ),
        const Duration(minutes: 2),
      );
      final context = tester.element(find.byType(MastermindFreshnessStrip));
      final colors = AppTokens.of(context).colorScheme;
      final text = tester.widget<Text>(find.textContaining('degraded'));
      expect(text.style?.color, colors.foreground);
      final glyph = tester.widget<Icon>(find.byIcon(AppIcons.warning));
      expect(glyph.color, AppTone.warning.foreground(colors));
      expect(text.maxLines, 1);
    });

    testWidgets('old data reads as last published, not as an error', (
      tester,
    ) async {
      await pumpStrip(tester, _ready(), const Duration(hours: 3));
      expect(find.text('Published 3 h ago'), findsOneWidget);
      expect(find.byIcon(AppIcons.warning), findsNothing);
    });

    testWidgets('offline shows the held time', (tester) async {
      await pumpStrip(
        tester,
        _ready(
          failure: const UnavailableRefresh(
            SnapshotUnavailableKind.unavailable,
          ),
        ),
        const Duration(hours: 3),
        online: false,
      );
      expect(find.text('Offline · showing $_short'), findsOneWidget);
      expect(find.byIcon(AppIcons.warning), findsOneWidget);
    });

    testWidgets('a failed refresh while online does not claim offline', (
      tester,
    ) async {
      await pumpStrip(
        tester,
        _ready(
          failure: const UnavailableRefresh(
            SnapshotUnavailableKind.unavailable,
          ),
        ),
        const Duration(hours: 3),
      );
      expect(find.text("Couldn't refresh · showing $_short"), findsOneWidget);
      expect(find.textContaining('Offline'), findsNothing);
      expect(find.byIcon(AppIcons.warning), findsOneWidget);
    });

    testWidgets('an unsupported schema asks for an app update', (tester) async {
      await pumpStrip(
        tester,
        _ready(
          failure: const RejectedRefresh(RejectionReason.unsupportedVersion),
        ),
        const Duration(minutes: 1),
      );
      expect(
        find.text(
          'Update the app to read the latest Mastermind data · showing $_short',
        ),
        findsOneWidget,
      );
    });

    testWidgets('an unreadable update keeps what is held', (tester) async {
      await pumpStrip(
        tester,
        _ready(failure: const RejectedRefresh(RejectionReason.schemaViolation)),
        const Duration(minutes: 1),
      );
      expect(
        find.text("Couldn't read the latest update · showing $_short"),
        findsOneWidget,
      );
    });

    testWidgets('degraded sources are appended and announced', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpStrip(
        tester,
        _ready(
          sources: [
            {'source': 'inbox', 'state': 'stale'},
            {'source': 'ci', 'state': 'missing'},
          ],
        ),
        const Duration(minutes: 1),
      );
      expect(find.text('Updated $_short · 2 sources degraded'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Updated $_time · 2 sources degraded'),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('is a live region only while it is a warning', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpStrip(tester, _ready(), const Duration(minutes: 1));
      expect(
        tester.getSemantics(find.bySemanticsLabel('Updated $_time')),
        isSemantics(isLiveRegion: false),
      );

      await pumpStrip(
        tester,
        _ready(
          failure: const UnavailableRefresh(
            SnapshotUnavailableKind.unavailable,
          ),
        ),
        const Duration(hours: 3),
        online: false,
      );
      await tester.pump();
      expect(
        tester.getSemantics(find.bySemanticsLabel('Offline · showing $_time')),
        isSemantics(isLiveRegion: true),
      );
      handle.dispose();
    });

    testWidgets('degraded sources open the Sources sheet from the strip', (
      tester,
    ) async {
      await pumpStrip(
        tester,
        _ready(
          sources: [
            {'source': 'inbox', 'state': 'ok'},
            {'source': 'ci', 'state': 'stale'},
            {'source': 'github', 'state': 'missing'},
          ],
        ),
        const Duration(minutes: 1),
      );
      expect(find.text('Sources'), findsNothing);
      await tester.tap(find.textContaining('2 sources degraded'));
      await tester.pumpAndSettle();
      expect(find.text('Sources'), findsOneWidget);
      expect(find.text('CI'), findsOneWidget);
      expect(find.text('Stale'), findsOneWidget);
      expect(find.text('GitHub'), findsOneWidget);
      expect(find.text('No source'), findsOneWidget);
      // Degraded sources come first, then the ones that are fine.
      expect(
        tester.getTopLeft(find.text('CI')).dy,
        lessThan(tester.getTopLeft(find.text('Inbox')).dy),
      );
      expect(find.text('OK'), findsOneWidget);
    });

    testWidgets('a healthy strip has nothing to open', (tester) async {
      await pumpStrip(tester, _ready(), const Duration(minutes: 1));
      await tester.tap(find.text('Updated $_short'));
      await tester.pumpAndSettle();
      expect(find.text('Sources'), findsNothing);
    });

    testWidgets('the tappable strip is a 44 dp target', (tester) async {
      await pumpStrip(
        tester,
        _ready(
          sources: [
            {'source': 'ci', 'state': 'stale'},
          ],
        ),
        const Duration(minutes: 1),
      );
      final target = tester.getSize(
        find
            .ancestor(
              of: find.textContaining('1 source degraded'),
              matching: find.byType(InkWell),
            )
            .first,
      );
      expect(target.height, greaterThanOrEqualTo(44));
    });
  });
}
