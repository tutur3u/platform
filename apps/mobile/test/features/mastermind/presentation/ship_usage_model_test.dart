import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_usage_fixture.dart';

void main() {
  setUpAll(initializeDateFormatting);
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

    test('a product with nothing observed is untracked, kept apart', () {
      Map<String, dynamic> blank(String product) =>
          shipEnv(
            product,
            deploy: 'unknown',
            ci: 'unknown',
            freshness: 'unknown',
            evidence: 'unknown',
            versionTag: null,
            sha: null,
          )..addAll({
            'released_at': null,
            'age_seconds': null,
            'observed_at': null,
          });
      final model = MastermindShipModel.from(
        parsedSnapshot(
          shipJson(
            environments: [
              blank('PKTM'),
              blank('MasteryAI'),
              // A reading in one environment is enough to track a product.
              blank('Upskii'),
              shipEnv('Upskii', environment: 'staging'),
            ],
            // A release age is enough too.
            releases: [
              shipRelease('MasteryAI'),
              shipRelease('PKTM', ageSeconds: null),
            ],
          ),
        ),
      );
      expect(model.untracked.map((g) => g.product.wireName), ['PKTM']);
      expect(model.groups.map((g) => g.product.wireName), [
        'MasteryAI',
        'Upskii',
      ]);
      expect(model.products, isNot(contains(ReleaseProduct.pktm)));
      expect(
        MastermindShipModel.from(
          parsedSnapshot(shipJson(environments: [blank('PKTM')])),
          product: ReleaseProduct.pktm,
        ).untracked,
        isEmpty,
      );
    });

    test('healthy products by most recent release, failing ones marked', () {
      final model = MastermindShipModel.from(
        parsedSnapshot(
          shipJson(
            environments: [
              shipEnv('Upskii'),
              shipEnv('PKTM'),
              shipEnv('Tuturuuu web', deploy: 'error'),
            ],
            releases: [
              shipRelease('Upskii', ageSeconds: 3600),
              shipRelease('PKTM', ageSeconds: 600),
            ],
          ),
        ),
      );
      expect(model.products.map((p) => p.wireName), [
        'Tuturuuu web',
        'PKTM',
        'Upskii',
      ]);
      expect(model.failing, {ReleaseProduct.tuturuuuWeb});
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

    test('pools rank by the worse of the session and weekly pacing', () {
      final labels = MastermindUsageModel.from(
        parsedSnapshot(
          usageJson(
            instances: [
              usagePoint('Claude pool E', session: 20),
              usagePoint('Codex pool A', weeklyPacing: 'SHORT'),
              usagePoint(
                'Codex pool B',
                session: 5,
                sessionPacing: 'SURPLUS',
                weeklyPacing: 'SURPLUS',
              ),
            ],
          ),
        ),
      ).pools.map((p) => p.label);
      // Session alone would put "Claude pool E" (20% left) first.
      expect(labels, ['Codex pool A', 'Claude pool E', 'Codex pool B']);
    });

    test(
      'quotas: unreadable first, least left next; forecasts: soonest first',
      () {
        final model = MastermindUsageModel.from(snapshot);
        expect(model.quotas.map((q) => q.instance), [
          'Claude pool A',
          'Claude pool B',
        ]);
        expect(model.quotas.first.remainingPercent, isNull);
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

    UsagePoint point({
      String? session = 'OK',
      String? weekly = 'OK',
      double? burn = 4.2,
    }) => MastermindUsageModel.from(
      parsedSnapshot(
        usageJson(
          instances: [
            usagePoint(
              'Claude pool A',
              sessionPacing: session,
              weeklyPacing: weekly,
              burn: burn,
            ),
          ],
        ),
      ),
    ).pools.single.latest;

    test('one verdict: the worse window that reports, null when none', () {
      expect(usageVerdict(point(session: 'SURPLUS')), Pacing.ok);
      expect(usageVerdict(point(weekly: 'SHORT')), Pacing.short);
      expect(usageVerdict(point(session: null)), Pacing.ok);
      expect(
        usageVerdict(point(session: 'SURPLUS', weekly: 'SURPLUS')),
        Pacing.surplus,
      );
      expect(usageVerdict(point(session: null, weekly: null)), isNull);
    });

    test('a zero burn next to SHORT is not shown as a burn rate', () {
      expect(usageBurnShown(point(session: 'SHORT', burn: 0).session), isNull);
      expect(usageBurnShown(point(session: 'SHORT', burn: 3).session), 3);
      // Zero is a real reading when the window is not short.
      expect(usageBurnShown(point(burn: 0).session), 0);
      expect(usageBurnShown(point(burn: null).session), isNull);
    });

    test('x-axis ticks: the time, the day only where it changes', () {
      final l10n = AppLocalizationsEn();
      final sameDay = [
        DateTime.utc(2026, 10, 28, 1),
        DateTime.utc(2026, 10, 28, 5),
      ];
      final label = usageTimeLabel(l10n, sameDay);
      expect(label(sameDay.first, date: true), '08:00');
      final spanning = [
        DateTime.utc(2026, 10, 27, 13, 30),
        DateTime.utc(2026, 10, 27, 22, 45),
      ];
      final across = usageTimeLabel(l10n, spanning);
      expect(across(spanning.first, date: true), 'Oct 27 20:30');
      expect(across(spanning.last, date: true), 'Oct 28 05:45');
      expect(across(spanning.last, date: false), '05:45');
    });

    test(
      'budget chart: caption says what is missing, legend what is drawn',
      () {
        final series = usageSeries(
          'Claude pool B',
          weekly: const [null, null, null],
        );
        final root = usageJson(
          coverage: 'partial',
          instances: [
            usagePoint('Claude pool B', weekly: null, weeklyPacing: null),
          ],
          series: series,
        );
        final spec = usageChartSpec(
          AppLocalizationsEn(),
          MastermindUsageModel.from(parsedSnapshot(root)),
          usageChartId(UsageChartKind.budget, 'Claude pool B'),
        )!;
        expect(spec.caption, 'Partial data: Weekly window not reported.');
        expect(spec.summary, startsWith('Partial data: Claude pool B'));
        expect(spec.series.map((s) => s.id), ['session', 'weekly']);
        expect(spec.drawnSeries.map((s) => s.id), ['session']);
      },
    );

    test('a chart for an absent pool is null', () {
      final model = MastermindUsageModel.from(snapshot);
      final l10n = AppLocalizationsEn();
      expect(usageChartSpec(l10n, model, 'budget:Claude pool Z'), isNull);
      expect(usageChartSpec(l10n, model, 'credits:Codex pool A'), isNull);
      expect(usageChartSpec(l10n, model, 'budget:Claude pool A'), isNotNull);
    });
  });
}
