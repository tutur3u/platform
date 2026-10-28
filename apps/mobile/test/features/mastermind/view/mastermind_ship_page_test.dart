import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';

import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

final Map<String, dynamic> _mixed = shipJson(
  environments: [
    shipEnv('Upskii', environment: 'staging'),
    shipEnv('Upskii'),
    shipEnv('Tuturuuu web', environment: 'staging', deploy: 'failure'),
    shipEnv('Tuturuuu web', subject: 'Withheld, open on Mac'),
    shipEnv('PKTM', freshness: 'stale', ci: 'pending', deploy: 'in_progress'),
  ],
  releases: [
    shipRelease('Upskii'),
    shipRelease('Tuturuuu web', ageSeconds: null),
    shipRelease('PKTM', ageSeconds: 7200),
  ],
  ci: [
    shipCi('upskii/platform', queued: null, running: null),
    shipCi('tutur3u/platform'),
  ],
  cadence: [
    shipCadence('Upskii', '2026-01-30T10:00:00+00:00'),
    shipCadence('PKTM', null),
    shipCadence('Tuturuuu web', '2026-01-31T10:00:00+00:00'),
  ],
  delivery: deliveryJson(
    ships: [
      {'t': '2026-01-31T10:00:00+00:00', 'product': 'Tuturuuu', 'count': 2},
      {'t': '2026-01-31T11:00:00+00:00', 'product': 'Upskii', 'count': 3},
    ],
    mergeToLive: [
      {
        't': '2026-01-31T11:00:00+00:00',
        'product': 'Tuturuuu',
        'median_minutes': 42.4,
        'samples': 5,
      },
    ],
    openPrs: [
      {'t': '2026-01-31T10:00:00+00:00', 'product': 'Tuturuuu', 'count': 9},
      {'t': '2026-01-31T11:00:00+00:00', 'product': 'Tuturuuu', 'count': 4},
      {'t': '2026-01-31T11:00:00+00:00', 'product': 'Upskii', 'count': null},
    ],
  ),
);

Finder _pill(String label) => find.descendant(
  of: find.byType(AppFilterBar<ReleaseProduct?>),
  matching: find.text(label),
);

void main() {
  testWidgets('Vietnamese at 200% keeps the final control above the dock', (
    tester,
  ) async {
    await pumpShip(
      tester,
      _mixed,
      locale: const Locale('vi'),
      textScale: 2,
      size: const Size(430, 800),
      dockClearance: 120,
    );
    expect(
      Localizations.localeOf(
        tester.element(find.byType(CustomScrollView).first),
      ).languageCode,
      'vi',
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -20000));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.getRect(find.byType(AppGroupedRow).last).bottom,
      lessThanOrEqualTo(680),
    );
  });

  group('environments', () {
    testWidgets('failing first, then the most recent release', (tester) async {
      await pumpShip(tester, _mixed);
      // PKTM went live 2 h ago, Upskii a day ago.
      final order = ['Tuturuuu web', 'PKTM', 'Upskii'];
      final tops = [for (final name in order) top(tester, name)];
      expect([...tops]..sort(), tops, reason: 'failing, then by recency');
    });

    testWidgets('production is listed before staging', (tester) async {
      await pumpShip(tester, _mixed);
      final production = tester.getTopLeft(find.text('Production').at(2)).dy;
      final staging = tester.getTopLeft(find.text('Staging').at(1)).dy;
      expect(production, lessThan(staging));
    });

    testWidgets('deploy and CI read as a glyph and a word', (tester) async {
      await pumpShip(tester, _mixed);
      expect(find.text('Deploy failure'), findsOneWidget);
      expect(find.text('Deploy in progress'), findsOneWidget);
      expect(find.text('CI pending'), findsOneWidget);
      // The product header and its failing environment.
      expect(find.text('Failing'), findsOneWidget);
    });

    testWidgets('shows the version, commit id and subject as display text', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(find.text('v1.2.3'), findsWidgets);
      expect(find.text('abcdef1'), findsWidgets);
      expect(find.textContaining('fix · ci'), findsWidgets);
      expect(find.byTooltip('Copy commit id'), findsWidgets);
      final copy = tester.getSize(find.byTooltip('Copy commit id').first);
      expect(copy.width, greaterThanOrEqualTo(44));
      expect(copy.height, greaterThanOrEqualTo(44));
    });

    testWidgets('a withheld subject is muted with the Mac tooltip', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(find.text('Withheld, open on Mac'), findsOneWidget);
      expect(find.byTooltip('Details stay on the Mac'), findsOneWidget);
    });

    testWidgets('a missing version and commit id hide their line', (
      tester,
    ) async {
      final json = shipJson(
        environments: [
          shipEnv('Upskii', versionTag: null, sha: null, subject: null),
        ],
      );
      await pumpShip(tester, json);
      expect(find.byTooltip('Copy commit id'), findsNothing);
      expect(find.text('v1.2.3'), findsNothing);
    });

    testWidgets('freshness is a chip only when it is not fresh', (
      tester,
    ) async {
      // The snapshot is fresh; one environment was last checked long ago.
      await pumpShip(tester, _mixed);
      expect(find.text('Stale'), findsOneWidget);
      expect(find.text('fresh'), findsNothing);
    });

    testWidgets('a release with no age leaves its line out, never zero', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      // Upskii and PKTM have an age; Tuturuuu web does not.
      expect(find.text('Live 1 day ago · GitHub deployment'), findsOneWidget);
      expect(find.text('Live 2 h ago · GitHub deployment'), findsOneWidget);
      expect(find.textContaining('Live'), findsNWidgets(2));
      expect(find.textContaining('Live 0'), findsNothing);
    });

    testWidgets('times are relative, absolute GMT+7 in semantics', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await pumpShip(tester, _mixed);
      expect(
        find.text('fix · ci · Released 2 h ago · Checked 30 min ago'),
        findsWidgets,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            r'Released Jan 31, 2026 17:00 GMT\+7 · '
            r'Checked Feb 1, 2026 00:00 GMT\+7 · GitHub deployment',
          ),
        ),
        findsWidgets,
      );
      semantics.dispose();
    });
  });

  group('CI now', () {
    testWidgets('an uncounted repository says Unavailable, never 0', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(
        find.text('Queued Unavailable · Running Unavailable'),
        findsOneWidget,
      );
      expect(find.text('Queued 2 · Running 1'), findsOneWidget);
      expect(find.textContaining('Queued 0'), findsNothing);
    });
  });

  group('release cadence', () {
    testWidgets('most recent first, a never-released product last', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(find.text('No production release observed'), findsOneWidget);
      // Compare inside the cadence section, below its caption.
      final base = top(tester, 'Release cadence');
      double rowTop(String product) => tester
          .widgetList<Text>(find.text(product))
          .map((w) => tester.getTopLeft(find.byWidget(w)).dy)
          .where((y) => y > base)
          .reduce((a, b) => a < b ? a : b);
      expect(rowTop('Tuturuuu web'), lessThan(rowTop('Upskii')));
      expect(rowTop('Upskii'), lessThan(rowTop('PKTM')));
    });
  });

  group('release cadence age', () {
    testWidgets('a production release after the snapshot reads just now', (
      tester,
    ) async {
      final json = shipJson(
        cadence: [shipCadence('Upskii', '2026-02-01T10:00:00+00:00')],
      );
      await pumpShip(tester, json);
      expect(find.text('just now'), findsOneWidget);
    });
  });

  group('pull requests and merges', () {
    testWidgets('shows the latest open count and merge-to-live median', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(find.text('4 open'), findsOneWidget);
      expect(find.text('9 open'), findsNothing);
      expect(find.text('42 min'), findsOneWidget);
      expect(find.textContaining('5 samples'), findsOneWidget);
      expect(
        find.text('At least 5 production releases observed.'),
        findsOneWidget,
      );
    });

    testWidgets('an uncounted pull request total is Unavailable', (
      tester,
    ) async {
      await pumpShip(tester, _mixed);
      expect(find.text('Unavailable'), findsWidgets);
    });

    testWidgets('no source says so once and shows no numbers', (tester) async {
      final json = shipJson(delivery: deliveryJson(coverage: 'unavailable'));
      await pumpShip(tester, json);
      expect(find.textContaining('open'), findsNothing);
    });

    testWidgets('has no action to open or merge anything', (tester) async {
      await pumpShip(tester, _mixed);
      expect(find.byType(ElevatedButton), findsNothing);
      expect(find.byType(FilledButton), findsNothing);
    });
  });

  group('redaction', () {
    testWidgets('shows no security row, id or digest', (tester) async {
      await pumpShip(tester, _mixed);
      expect(find.textContaining('Security'), findsNothing);
      expect(find.textContaining('security fix'), findsNothing);
      expect(find.textContaining('item-'), findsNothing);
      expect(find.textContaining(testDigest), findsNothing);
    });
  });

  group('whole-section states', () {
    testWidgets('empty: no environments reported', (tester) async {
      await pumpShip(tester, shipJson());
      expect(find.text('No environments reported.'), findsOneWidget);
      expect(find.text('No release cadence reported'), findsOneWidget);
    });

    testWidgets('stale data reads as last published, rows still shown', (
      tester,
    ) async {
      final json = Map<String, dynamic>.of(_mixed)
        ..['generated_at'] = '2026-01-31T14:30:00+00:00';
      await pumpShip(tester, json);
      expect(
        find.textContaining('Mastermind last published 3 h ago'),
        findsOneWidget,
      );
      expect(find.text('Tuturuuu web'), findsWidgets);
    });

    testWidgets('offline keeps the cached rows under a warning strip', (
      tester,
    ) async {
      final harness = await pumpShip(tester, _mixed);
      harness.scheduler.setOnline(online: false);
      harness.source.fetcher = () async =>
          const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.textContaining('Offline · showing'), findsOneWidget);
      expect(find.text('Deploy failure'), findsOneWidget);
    });

    testWidgets('forbidden says so and shows no environments', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            const SnapshotFetch.unavailable(SnapshotUnavailableKind.forbidden);
      await pumpShip(tester, _mixed, source: source);
      expect(
        find.text("This account isn't allowed to view Mastermind"),
        findsOneWidget,
      );
      expect(find.text('Deploy failure'), findsNothing);
    });
  });

  group('product filter in the URL', () {
    testWidgets('a chip filters and writes the product to the URL', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindShip);
      await pumpShip(tester, _mixed, router: router);
      await tester.ensureVisible(_pill('Upskii'));
      await tester.tap(_pill('Upskii'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).toString(),
        '${Routes.mastermindShip}?product=Upskii',
      );
      expect(find.text('Deploy failure'), findsNothing);
      await tester.ensureVisible(_pill('All'));
      await tester.tap(_pill('All'));
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), Routes.mastermindShip);
      expect(find.text('Deploy failure'), findsOneWidget);
    });

    testWidgets('a location naming a product starts on it', (tester) async {
      final router = workRouter('${Routes.mastermindShip}?product=PKTM');
      await pumpShip(tester, _mixed, router: router);
      expect(find.text('Deploy in progress'), findsOneWidget);
      expect(find.text('Deploy failure'), findsNothing);
    });

    testWidgets('a product the snapshot lacks is cleaned from the URL', (
      tester,
    ) async {
      final router = workRouter('${Routes.mastermindShip}?product=MasteryAI');
      await pumpShip(tester, _mixed, router: router);
      expect(workUri(router).toString(), Routes.mastermindShip);
      expect(find.text('Deploy failure'), findsOneWidget);
    });
  });

  group('layout', () {
    testWidgets('the last row clears the dock', (tester) async {
      const height = 800.0;
      const dock = 120.0;
      await pumpShip(
        tester,
        _mixed,
        size: const Size(430, height),
        dockClearance: dock,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -5000));
      await tester.pumpAndSettle();
      final last = tester.getRect(find.byType(AppGroupedRow).last);
      expect(last.bottom, lessThanOrEqualTo(height - dock));
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      await pumpShip(tester, _mixed);
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byIcon(Icons.arrow_back), findsNothing);
    });
  });
}
