import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/ship/mastermind_ship_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_view_harness.dart';

/// An environment the hub has nothing on: every reading unknown.
Map<String, dynamic> _blank(String product, {String env = 'production'}) =>
    shipEnv(
      product,
      environment: env,
      deploy: 'unknown',
      ci: 'unknown',
      freshness: 'unknown',
      evidence: 'unknown',
      versionTag: null,
      sha: null,
      subject: null,
    )..addAll({'released_at': null, 'age_seconds': null, 'observed_at': null});

final Map<String, dynamic> _withUntracked = shipJson(
  environments: [
    _blank('MasteryAI'),
    _blank('MasteryAI', env: 'staging'),
    _blank('PKTM'),
    shipEnv('Upskii'),
    shipEnv('Tuturuuu web', deploy: 'failure'),
  ],
  releases: [
    shipRelease('Upskii'),
    shipRelease('Tuturuuu web'),
    shipRelease('PKTM', ageSeconds: null),
  ],
);

Iterable<String?> _texts(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((t) => t.data);

void main() {
  group('not tracked yet', () {
    testWidgets('products with nothing observed collapse into one row', (
      tester,
    ) async {
      await pumpShip(tester, _withUntracked);
      expect(find.text('Not tracked yet'), findsOneWidget);
      expect(find.text('MasteryAI, PKTM'), findsOneWidget);
      // No card of empty readings for either of them.
      expect(find.text('Staging'), findsNothing);
      expect(find.textContaining('Not published yet'), findsNothing);
      for (final text in _texts(tester)) {
        expect(text?.toLowerCase(), isNot('unknown'));
      }
      // Below every tracked product.
      expect(
        top(tester, 'Not tracked yet'),
        greaterThan(top(tester, 'Upskii')),
      );

      await tester.tap(find.text('Not tracked yet'));
      await tester.pumpAndSettle();
      expect(find.text('No deployments observed'), findsNWidgets(2));
      expect(find.text('MasteryAI'), findsOneWidget);
    });

    testWidgets('the filter lists tracked products only, failing marked', (
      tester,
    ) async {
      await pumpShip(tester, _withUntracked);
      final bar = find.byType(AppFilterBar<ReleaseProduct?>);
      expect(bar, findsOneWidget);
      for (final label in ['All', 'Tuturuuu web', 'Upskii']) {
        expect(
          find.descendant(of: bar, matching: find.text(label)),
          findsOneWidget,
          reason: label,
        );
      }
      expect(
        find.descendant(of: bar, matching: find.text('PKTM')),
        findsNothing,
      );
      expect(
        find.descendant(of: bar, matching: find.byIcon(AppIcons.warning)),
        findsOneWidget,
      );
      // One row that scrolls sideways, never a wrap.
      expect(tester.getSize(bar).height, lessThan(60));
    });

    testWidgets('a product filter hides the untracked row', (tester) async {
      await pumpShip(tester, _withUntracked);
      final upskii = find.descendant(
        of: find.byType(AppFilterBar<ReleaseProduct?>),
        matching: find.text('Upskii'),
      );
      await tester.ensureVisible(upskii);
      await tester.tap(
        find.descendant(
          of: find.byType(AppFilterBar<ReleaseProduct?>),
          matching: find.text('Upskii'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Not tracked yet'), findsNothing);
    });
  });

  group('release cadence', () {
    testWidgets('caps at five with Show all, then expands in place', (
      tester,
    ) async {
      final products = [
        'Upskii',
        'PKTM',
        'MasteryAI',
        'Tuturuuu web',
        'Tuturuuu calendar',
        'Tuturuuu contacts',
        'Tuturuuu mobile',
      ];
      await pumpShip(
        tester,
        shipJson(
          cadence: [
            for (final (i, product) in products.indexed)
              shipCadence(product, '2026-01-${30 - i}T10:00:00+00:00'),
          ],
        ),
      );
      expect(find.text('Show all 7'), findsOneWidget);
      expect(find.text('Tuturuuu contacts'), findsNothing);
      await tester.tap(find.text('Show all 7'));
      await tester.pumpAndSettle();
      expect(find.text('Tuturuuu contacts'), findsOneWidget);
      expect(find.text('Tuturuuu mobile'), findsOneWidget);
      expect(find.text('Show fewer'), findsOneWidget);
    });
  });

  group('Forge v1 fixture', () {
    setUpAll(initializeDateFormatting);

    testWidgets('every product untracked: one row, reasons on expand', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(430, 4000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final harness = MastermindViewHarness(
        source: FakeHubSource(
          bytes: File(
            'test/fixtures/mastermind/forge_v1_redacted.json',
          ).readAsBytesSync(),
        ),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpApp(harness.wrap(const MastermindShipPage()));
      await tester.pumpAndSettle();
      expect(find.text('Not tracked yet'), findsOneWidget);
      expect(find.byType(AppFilterBar<ReleaseProduct?>), findsNothing);
      expect(find.text('Production'), findsNothing);
      expect(find.text('No environments reported.'), findsNothing);
      await tester.tap(find.text('Not tracked yet'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Not connected'), findsAtLeastNWidgets(7));
      for (final text in _texts(tester)) {
        expect(text?.toLowerCase(), isNot('unknown'));
      }
      expect(find.byType(AppGroupedRow), findsWidgets);
    });
  });
}
