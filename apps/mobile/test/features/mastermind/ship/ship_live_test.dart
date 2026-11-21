import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/ship/ship_data.dart';
import 'package:mobile/features/mastermind/ship/ship_page.dart';
import 'package:mobile/features/mastermind/ship/ship_view.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';

final _now = DateTime.utc(2026, 11, 22, 10, 0, 40);
String _at(Duration ago) => _now.subtract(ago).toIso8601String();
String _sha(String seed) => List.filled(40, seed).join();

Map<String, dynamic> _source(
  String id, [
  Map<String, dynamic> patch = const {},
]) => {
  'id': id,
  'name': id,
  'state': 'ok',
  'checkedAt': _at(const Duration(seconds: 40)),
  'okAt': _at(const Duration(seconds: 40)),
  'retryAt': null,
  'problem': null,
  ...patch,
};

Map<String, dynamic> _release(
  String seed, {
  String ci = 'success',
  String deploy = 'ok',
}) => {
  'sha': _sha(seed),
  'deployedAt': '2026-11-21T16:58:00.000Z',
  'environment': 'cloudflare-production-web',
  'ci': ci,
  'deploy': deploy,
};

Map<String, dynamic> _json({List<Map<String, dynamic>>? sources}) => {
  'servedAt': _now.toIso8601String(),
  'snapshot': {
    'version': 1,
    'collectedAt': _at(const Duration(seconds: 40)),
    'trigger': 'schedule',
    'sources':
        sources ?? [_source('github:tutur3u/platform'), _source('cloudflare')],
    'apps': [
      {
        'id': 'web',
        'name': 'Web',
        'repository': 'tutur3u/platform',
        'production': {
          'release': _release('a', deploy: 'failed'),
          'worker': null,
        },
        'staging': {'release': _release('c', ci: 'pending'), 'worker': null},
        'pending': {
          'commits': 14,
          'capped': false,
          'oldestAt': _at(const Duration(hours: 30)),
          'headSha': _sha('c'),
        },
        'sources': ['github:tutur3u/platform', 'cloudflare'],
      },
      {
        'id': 'calendar',
        'name': 'Calendar',
        'repository': 'tutur3u/platform',
        'production': {
          'release': _release('b', ci: 'failure'),
          'worker': {
            'script': 'tuturuuu-calendar',
            'versionId': '11111111-1111-4111-8111-111111111111',
            'percentage': 100,
            'deployedAt': '2026-11-21T11:11:00.000Z',
            'sha': _sha('d'),
          },
        },
        'staging': {'release': null, 'worker': null},
        'pending': {
          'commits': 0,
          'capped': false,
          'oldestAt': null,
          'headSha': _sha('c'),
        },
        'sources': ['github:tutur3u/platform', 'cloudflare'],
      },
      {
        'id': 'mobile',
        'name': 'iOS/Android',
        'repository': 'tutur3u/platform',
        'production': {'release': _release('a'), 'worker': null},
        'staging': null,
        'pending': null,
        'sources': ['github:tutur3u/platform'],
      },
      {
        'id': 'pktm',
        'name': 'PKTM',
        'repository': null,
        'production': {'release': null, 'worker': null},
        'staging': {'release': null, 'worker': null},
        'pending': null,
        'sources': <String>[],
      },
    ],
  },
};

final class _FakeShip implements ShipLiveSource {
  _FakeShip(this.json);
  Map<String, dynamic>? json;
  int checks = 0;
  final reads = <bool>[];

  @override
  Future<ShipSnapshot> fetch({bool fresh = false}) async {
    reads.add(fresh);
    return json == null
        ? throw const FormatException('x')
        : ShipSnapshot.parse(json!);
  }

  @override
  Future<ShipCheckResult> check() async {
    checks++;
    return (state: ShipCheckState.checked, retryAfter: null);
  }
}

class _Api extends Mock implements ApiClient {}

Future<void> _pump(WidgetTester tester, _FakeShip source) async {
  tester.view.physicalSize = const Size(430, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final harness = MastermindViewHarness();
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(ShipLivePage(source: source, now: () => _now)),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => registerFallbackValue(Duration.zero));
  group('ShipSnapshot', () {
    test('parses the Web contract and refuses values outside it', () {
      final snapshot = ShipSnapshot.parse(_json());
      expect(snapshot.apps.map((app) => app.id), [
        'web',
        'calendar',
        'mobile',
        'pktm',
      ]);
      expect(snapshot.apps.first.production.release?.deploy, ShipDeploy.failed);
      final bad = _json();
      final apps = (bad['snapshot'] as Map<String, dynamic>)['apps'] as List;
      final web = apps.first as Map<String, dynamic>;
      final production = web['production'] as Map<String, dynamic>;
      (production['release'] as Map<String, dynamic>)['sha'] = 'x';
      expect(() => ShipSnapshot.parse(bad), throwsFormatException);
      for (final mutate in <void Function(Map<String, dynamic>)>[
        (app) => (app['pending'] as Map<String, dynamic>).remove('capped'),
        (app) => app['production'] = {
          'release': null,
          'worker': {'versionId': 'x'},
        },
      ]) {
        final broken = _json();
        mutate(
          ((broken['snapshot'] as Map<String, dynamic>)['apps'] as List).first
              as Map<String, dynamic>,
        );
        expect(() => ShipSnapshot.parse(broken), throwsFormatException);
      }
    });

    test('every row carries one freshness kind', () {
      final partial = ShipView(
        ShipSnapshot.parse(
          _json(
            sources: [
              _source('github:tutur3u/platform'),
              _source('cloudflare', {'state': 'error', 'okAt': null}),
            ],
          ),
        ),
        _now,
      );
      final kinds = {
        for (final app in partial.snapshot.apps)
          app.id: partial.freshnessOf(app).kind,
      };
      expect(kinds, {
        'web': ShipFreshnessKind.partial,
        'calendar': ShipFreshnessKind.partial,
        'mobile': ShipFreshnessKind.checked,
        'pktm': ShipFreshnessKind.unknown,
      });
      expect(partial.page, ShipPageKind.partial);
      final later = ShipView(
        ShipSnapshot.parse(_json()),
        _now.add(const Duration(minutes: 7)),
      );
      expect(
        later.freshnessOf(later.snapshot.apps.first).kind,
        ShipFreshnessKind.stale,
      );
    });
  });

  group('ShipLiveSource.check', () {
    Future<ShipCheckState> stateFor(ApiException error) async {
      final api = _Api();
      when(
        () => api.postJson(any(), any(), timeout: any(named: 'timeout')),
      ).thenThrow(error);
      return (await ShipLiveSource(api: api).check()).state;
    }

    test('tells a disabled collector from a stopped one', () async {
      expect(
        await stateFor(
          const ApiException(message: 'x', statusCode: 409, code: 'disabled'),
        ),
        ShipCheckState.disabled,
      );
      expect(
        await stateFor(
          const ApiException(message: 'x', statusCode: 409, code: 'stopped'),
        ),
        ShipCheckState.stopped,
      );
      expect(
        await stateFor(
          const ApiException(message: 'x', statusCode: 429, retryAfter: 20),
        ),
        ShipCheckState.rateLimited,
      );
    });
  });

  group('ShipLivePage', () {
    testWidgets('shows live state, the release gap and stamps per row', (
      tester,
    ) async {
      await _pump(tester, _FakeShip(_json()));
      expect(find.text('Deploy failed'), findsOneWidget);
      expect(find.text('CI failed'), findsOneWidget);
      expect(find.text('Worker runs ddddddd'), findsOneWidget);
      expect(find.textContaining('14 commits waiting, oldest'), findsOneWidget);
      expect(find.text('Up to date'), findsOneWidget);
      expect(find.text('Source not configured'), findsOneWidget);
      expect(find.text('Tuturuuu platform'), findsOneWidget);
      expect(find.text('Waiting 14'), findsOneWidget);
      expect(find.textContaining('ICT'), findsWidgets);
    });

    testWidgets('hides rows when every source is down until asked', (
      tester,
    ) async {
      final source = _FakeShip(
        _json(
          sources: [
            _source('github:tutur3u/platform', {
              'state': 'error',
              'okAt': '2026-11-22T09:38:00.000Z',
            }),
            _source('cloudflare', {'state': 'backoff', 'okAt': null}),
          ],
        ),
      );
      await _pump(tester, source);
      expect(find.text('No source reachable'), findsOneWidget);
      expect(find.text('Web'), findsNothing);
      await tester.tap(find.textContaining('snapshot, marked stale'));
      await tester.pumpAndSettle();
      expect(find.text('Web'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(source.checks, 1);
      // The read after a check is fresh, never joined to an older poll.
      expect(source.reads.last, isTrue);
    });

    testWidgets('a failed refresh hides the shown snapshot until asked', (
      tester,
    ) async {
      final source = _FakeShip(_json());
      await _pump(tester, source);
      expect(find.text('Web'), findsOneWidget);
      source.json = null;
      // The next 30-second poll fails.
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      expect(find.text('Ship data is unavailable'), findsOneWidget);
      expect(find.text('Web'), findsNothing);
      await tester.tap(find.text('View the last snapshot, marked stale'));
      await tester.pumpAndSettle();
      expect(find.text('Web'), findsOneWidget);
      // Shown, but never as current.
      expect(find.textContaining(', stale'), findsWidgets);
      expect(
        find.text(
          'The last read failed. The last snapshot is shown, marked stale.',
        ),
        findsOneWidget,
      );
      // A good read ends the opt-in; the next failure hides the rows again.
      source.json = _json();
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      expect(find.text('Ship data is unavailable'), findsNothing);
      source.json = null;
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();
      expect(find.text('Web'), findsNothing);
    });

    testWidgets('an unreadable answer shows a failure, never stale rows', (
      tester,
    ) async {
      await _pump(tester, _FakeShip(null));
      expect(find.text('Web'), findsNothing);
    });
  });
}
