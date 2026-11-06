import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/ship/mastermind_ship_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

/// One product only, so a `?product=` filter has no chip and must reset.
final Map<String, dynamic> _single = shipJson(
  environments: [
    shipEnv('Upskii'),
    shipEnv('Upskii', environment: 'staging'),
  ],
);

GoRouter _router(List<ReleaseProduct?> reported) => GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (_, _) => MastermindShipPage(
        initialProduct: ReleaseProduct.upskii,
        onProduct: reported.add,
      ),
    ),
    GoRoute(
      path: '/over',
      builder: (_, _) => const Scaffold(body: Text('over')),
    ),
  ],
);

void main() {
  group('a product filter that has no chip', () {
    testWidgets('shows the whole list and rewrites the URL once', (
      tester,
    ) async {
      workSurface(tester);
      final reported = <ReleaseProduct?>[];
      final router = _router(reported);
      addTearDown(router.dispose);
      final harness = MastermindViewHarness(
        source: FakeHubSource(bytes: snapshotBytes(_single)),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpAppRouter(router, wrap: harness.wrap);
      await tester.pumpAndSettle();

      expect(find.text('Production'), findsWidgets);
      expect(reported, [null]);
    });

    testWidgets('waits for the page to be on top before rewriting', (
      tester,
    ) async {
      workSurface(tester);
      final reported = <ReleaseProduct?>[];
      final router = _router(reported);
      addTearDown(router.dispose);
      final source = FakeHubSource(bytes: snapshotBytes(_single));
      final gate = Completer<void>();
      source.fetcher = () async {
        await gate.future;
        return SnapshotFetch.ok(source.bytes, testNow, digest: testDigest);
      };
      final harness = MastermindViewHarness(source: source);
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpAppRouter(router, wrap: harness.wrap);
      await tester.pump();

      // A route opens over the page before its data arrives.
      router.push<void>('/over').ignore();
      await tester.pump(const Duration(seconds: 1));
      gate.complete();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      expect(reported, isEmpty);

      router.pop();
      await tester.pumpAndSettle();
      expect(reported, [null]);
    });
  });
}
