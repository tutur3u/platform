import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/app_router_access_redirects.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_state.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/mastermind_module.dart';

import 'package:mobile/features/workspace/workspace_presentation.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';

const _loaded = MastermindAccessState(
  status: MastermindAccessStatus.loaded,
  enabled: true,
);

void main() {
  group('Apps hub entry', () {
    Future<List<String>> visibleIds(
      WidgetTester tester,
      MastermindViewHarness harness,
    ) async {
      late List<String> ids;
      await tester.pumpApp(
        harness.wrap(
          Builder(
            builder: (context) {
              ids = [for (final m in AppRegistry.modules(context)) m.id];
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      return ids;
    }

    for (final entry in {
      TestAccess.enabled: true,
      TestAccess.disabled: false,
      TestAccess.loading: false,
      TestAccess.error: false,
    }.entries) {
      testWidgets('access ${entry.key.name}: entry shown=${entry.value}', (
        tester,
      ) async {
        final harness = MastermindViewHarness();
        addTearDown(harness.dispose);
        await harness.setAccess(entry.key);
        expect(
          await visibleIds(tester, harness),
          entry.value ? contains('mastermind') : isNot(contains('mastermind')),
        );
      });
    }

    testWidgets('a 403 hides the entry until the next access sync', (
      tester,
    ) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      expect(await visibleIds(tester, harness), contains('mastermind'));

      harness.access.markForbidden();
      expect(await visibleIds(tester, harness), isNot(contains('mastermind')));

      await harness.setAccess(TestAccess.enabled);
      expect(await visibleIds(tester, harness), contains('mastermind'));
    });

    test('is registered once, outside the experimental and core sets', () {
      expect(
        AppRegistry.allModules.where((m) => m.id == 'mastermind'),
        hasLength(1),
      );
      expect(AppRegistry.experimentalModuleIds, isNot(contains('mastermind')));
      expect(AppRegistry.coreModuleIds, isNot(contains('mastermind')));
      expect(mastermindModule.route, Routes.mastermind);
    });
  });

  group('mini-app shell', () {
    test('has five tabs, each with its own route', () {
      expect(mastermindModule.miniAppNavItems.map((item) => item.route), [
        Routes.mastermind,
        Routes.mastermindInbox,
        Routes.mastermindWork,
        Routes.mastermindShip,
        Routes.mastermindInsights,
      ]);
    });

    test('every tab location belongs to the Mastermind root', () {
      for (final item in mastermindModule.miniAppNavItems) {
        expect(Routes.miniAppRootForLocation(item.route), Routes.mastermind);
        expect(AppRegistry.moduleFromLocation(item.route)?.id, 'mastermind');
      }
      expect(
        Routes.miniAppRootForLocation('/mastermind/inbox/item/abc'),
        Routes.mastermind,
      );
    });
  });

  group('route gate (deep links and push taps)', () {
    test('holds the route while access is unknown or loading', () {
      for (final status in [
        MastermindAccessStatus.initial,
        MastermindAccessStatus.loading,
      ]) {
        for (final location in [
          Routes.mastermind,
          Routes.mastermindInbox,
          '/mastermind/inbox/item/x',
        ]) {
          expect(
            shouldRedirectDisabledMastermindRoutes(
              location,
              MastermindAccessState(status: status),
            ),
            isFalse,
            reason: '$status $location',
          );
        }
      }
    });

    test('sends every Mastermind location away without access', () {
      for (final state in [
        const MastermindAccessState(status: MastermindAccessStatus.loaded),
        const MastermindAccessState(status: MastermindAccessStatus.error),
      ]) {
        for (final location in [
          Routes.mastermind,
          Routes.mastermindInbox,
          Routes.mastermindWork,
          Routes.mastermindShip,
          Routes.mastermindInsights,
          '/mastermind/activity',
        ]) {
          expect(
            shouldRedirectDisabledMastermindRoutes(location, state),
            isTrue,
            reason: '${state.status} $location',
          );
        }
      }
    });

    test('lets enabled access through, and ignores other routes', () {
      expect(
        shouldRedirectDisabledMastermindRoutes(Routes.mastermindWork, _loaded),
        isFalse,
      );
      expect(
        shouldRedirectDisabledMastermindRoutes(
          Routes.tasks,
          const MastermindAccessState(status: MastermindAccessStatus.loaded),
        ),
        isFalse,
      );
    });

    test('a forbidden account stays on the screen that explains it', () {
      expect(
        shouldRedirectDisabledMastermindRoutes(
          Routes.mastermind,
          const MastermindAccessState(
            status: MastermindAccessStatus.loaded,
            enabled: true,
            forbidden: true,
          ),
        ),
        isFalse,
      );
    });

    test('web links open the matching tab and never carry ids', () {
      for (final entry in {
        'mastermind': Routes.mastermind,
        'mastermind/inbox': Routes.mastermindInbox,
        'mastermind/work': Routes.mastermindWork,
        'mastermind/ship': Routes.mastermindShip,
        'mastermind/insights': Routes.mastermindInsights,
        'mastermind/insights/usage/table/budget:Claude%20pool%20A':
            Routes.mastermindInsights,
        'mastermind/inbox/item-00000000000000000001': Routes.mastermindInbox,
        'mastermind/unknown': Routes.mastermind,
      }.entries) {
        expect(
          resolveMobileDeepLink(
            Uri.parse('https://tuturuuu.com/personal/${entry.key}'),
          )?.location,
          entry.value,
          reason: entry.key,
        );
      }
    });
  });

  group('runtime', () {
    testWidgets('logout and account switch erase the cache', (tester) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await harness.snapshot.ensureLoaded();
      expect(harness.snapshot.state, isA<MastermindSnapshotReady>());
      expect(await harness.store.read(), isNotNull);

      await harness.runtime.reset();

      expect(harness.snapshot.state, isA<MastermindSnapshotInitial>());
      expect(await harness.store.read(), isNull);
      expect(harness.access.state.enabled, isFalse);
    });

    testWidgets('an account switch re-checks access for the workspace', (
      tester,
    ) async {
      final harness = MastermindViewHarness();
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);

      await harness.runtime.reset(wsId: rootWorkspaceId);

      expect(harness.access.state.enabled, isTrue);
    });
  });

  group('live source stays off by default', () {
    test('no define and no flavor means unconfigured', () {
      expect(createMastermindSnapshotSource().isConfigured, isFalse);
      expect(MastermindHubConfig.resolve(flavor: 'development'), isNull);
    });

    test('production stays off until the beta rollout', () {
      expect(MastermindHubConfig.resolve(flavor: 'production'), isNull);
    });

    test('the staging flavor names the staging host', () {
      expect(
        MastermindHubConfig.resolve(flavor: 'staging').toString(),
        'https://mastermind-hub-staging.tutur3u.com',
      );
    });
  });
}
