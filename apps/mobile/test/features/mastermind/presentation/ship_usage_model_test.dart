import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_usage_fixture.dart';

void main() {
  group('MastermindShipModel', () {
    final snapshot = parsedSnapshot(
      shipJson(
        environments: [
          shipEnv('Upskii', environment: 'staging'),
          shipEnv('Upskii'),
          shipEnv('PKTM', ci: 'error'),
          shipEnv('Tuturuuu web'),
        ],
        releases: [shipRelease('MasteryAI')],
        ci: [shipCi('upskii/platform', queued: 1), shipCi('tutur3u/platform')],
        cadence: [
          shipCadence('Upskii', null),
          shipCadence('PKTM', '2026-01-30T10:00:00+00:00'),
        ],
      ),
    );

    test('failing products first, then by name; production before staging', () {
      final model = MastermindShipModel.from(snapshot);
      expect(model.groups.map((g) => g.product.wireName), [
        'PKTM',
        'MasteryAI',
        'Tuturuuu web',
        'Upskii',
      ]);
      expect(model.groups.last.environments.map((e) => e.environment), [
        Environment.production,
        Environment.staging,
      ]);
      expect(model.groups.first.failing, isTrue);
    });

    test('a product with only a release still gets a group', () {
      final group = MastermindShipModel.from(
        snapshot,
      ).groups.firstWhere((g) => g.product == ReleaseProduct.masteryAI);
      expect(group.environments, isEmpty);
      expect(group.release, isNotNull);
    });

    test('CI readings come in repository order', () {
      final ci = MastermindShipModel.from(snapshot).ci;
      expect(ci.map((c) => c.repo), RepositoryName.values);
      expect(ci.last.queued, 1);
    });

    test('cadence: most recent first, never released last', () {
      final cadence = MastermindShipModel.from(snapshot).cadence;
      expect(cadence.map((c) => c.product.wireName), ['PKTM', 'Upskii']);
    });

    test('the filter narrows groups and cadence, not the chips', () {
      final model = MastermindShipModel.from(
        snapshot,
        product: ReleaseProduct.upskii,
      );
      expect(model.groups, hasLength(1));
      expect(model.cadence, hasLength(1));
      expect(model.products, hasLength(4));
    });

    test('shipLocation and the query round-trip', () {
      expect(shipLocation(), '/mastermind/ship');
      final location = shipLocation(product: ReleaseProduct.tuturuuuWeb);
      expect(
        releaseProductFromQuery(Uri.parse(location).queryParameters['product']),
        ReleaseProduct.tuturuuuWeb,
      );
      expect(releaseProductFromQuery('nope'), isNull);
    });
  });

  group('MastermindUsageModel', () {
    final snapshot = parsedSnapshot(
      usageJson(
        instances: [
          usagePoint('Claude pool A', session: 70),
          usagePoint('Claude pool B', session: 20),
          usagePoint('Claude pool C', session: 10, sessionPacing: 'SHORT'),
          usagePoint('Claude pool D', session: null, sessionPacing: 'SHORT'),
        ],
        quotas: [
          {
            'instance': 'Claude pool A',
            'remaining_percent': null,
            'age_seconds': 1,
          },
          {
            'instance': 'Claude pool B',
            'remaining_percent': 5,
            'age_seconds': 1,
          },
        ],
        forecasts: [
          {
            'instance': 'Claude pool A',
            'projected_empty_at': null,
            'resets_at': null,
          },
          {
            'instance': 'Claude pool B',
            'projected_empty_at': '2026-01-31T20:00:00+00:00',
            'resets_at': null,
          },
        ],
      ),
    );

    test('pools: SHORT first, least left first, an unreading last', () {
      final labels = MastermindUsageModel.from(
        snapshot,
      ).pools.map((p) => p.label);
      expect(labels, [
        'Claude pool C',
        'Claude pool D',
        'Claude pool B',
        'Claude pool A',
      ]);
    });

    test(
      'quotas: least left first, unknown last; forecasts: soonest first',
      () {
        final model = MastermindUsageModel.from(snapshot);
        expect(model.quotas.map((q) => q.instance), [
          'Claude pool B',
          'Claude pool A',
        ]);
        expect(model.forecasts.first.instance, 'Claude pool B');
      },
    );

    test('chart ids parse and reject', () {
      final id = usageChartId(UsageChartKind.budget, 'Claude pool A');
      expect(parseUsageChartId(id)?.label, 'Claude pool A');
      expect(parseUsageChartId(id)?.kind, UsageChartKind.budget);
      for (final bad in ['', 'budget', 'budget:', ':x', 'nope:x']) {
        expect(parseUsageChartId(bad), isNull, reason: bad);
      }
    });

    test('a chart for an absent pool is null', () {
      final model = MastermindUsageModel.from(snapshot);
      final l10n = AppLocalizationsEn();
      expect(usageChartSpec(l10n, model, 'budget:Claude pool Z'), isNull);
      expect(usageChartSpec(l10n, model, 'credits:Codex pool A'), isNull);
      expect(usageChartSpec(l10n, model, 'budget:Claude pool A'), isNotNull);
    });
  });
}
