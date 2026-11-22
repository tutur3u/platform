import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/features/mastermind/usage/usage_content.dart';
import 'package:mobile/features/mastermind/usage/usage_reasons.dart';

import '../../../helpers/pump_app.dart';

// Shapes the M4 publisher sent on 2026-11-22: three readers refused or
// absent, Claude limits rechecked every few minutes, and Cursor capped on a
// monthly window.
Map<String, dynamic> _account(
  String id, {
  required DateTime checkedAt,
  Map<String, dynamic> status = const {'kind': 'available'},
  List<Map<String, dynamic>> windows = const [],
}) => {
  'id': id,
  'provider': 'claudeAgent',
  'instance': id,
  'email': null,
  'plan': null,
  'checkedAt': checkedAt.toIso8601String(),
  'status': status,
  'windows': windows,
};

FleetUsage _usage(DateTime now) {
  final fresh = now.subtract(const Duration(seconds: 20));
  final machines = [
    {
      'id': 'skr-m4',
      'label': 'M4',
      'quota': {'kind': 'complete', 'observedAt': fresh.toIso8601String()},
      'accounting': {'kind': 'complete', 'observedAt': fresh.toIso8601String()},
      'accounts': [
        // Checked five minutes ago: still current for an account reading.
        _account(
          'personal',
          checkedAt: now.subtract(const Duration(minutes: 5)),
          windows: [
            {'kind': 'weekly', 'usedPercent': 72, 'resetsAt': null},
          ],
        ),
        _account(
          'cursor',
          checkedAt: fresh,
          status: {'kind': 'limited', 'reason': 'monthly'},
          windows: [
            {'kind': 'session', 'usedPercent': 10, 'resetsAt': null},
            {'kind': 'weekly', 'usedPercent': 20, 'resetsAt': null},
            {'kind': 'monthly', 'usedPercent': 100, 'resetsAt': null},
          ],
        ),
      ],
      'buckets': [
        {
          'day': '2026-11-22',
          'provider': 'claudeAgent',
          'model': 'fixture-model',
          'accountId': null,
          'uncachedInputTokens': 1,
          'cachedInputTokens': 0,
          'cacheCreationTokens': 0,
          'outputTokens': 1,
          'unpricedRecords': 420,
          'costUsd': 1.5,
        },
      ],
    },
    {
      'id': 'macstudio1',
      'label': 'MacStudio1',
      'quota': {'kind': 'complete', 'observedAt': fresh.toIso8601String()},
      'accounting': {'kind': 'complete', 'observedAt': fresh.toIso8601String()},
      'accounts': [
        _account(
          'skora',
          checkedAt: fresh,
          status: {'kind': 'limited', 'reason': 'weekly'},
        ),
      ],
      'buckets': <Object>[],
    },
    {
      'id': 'c02',
      'label': 'C02',
      'quota': {'kind': 'unavailable', 'reason': 'reader_refused'},
      'accounting': {'kind': 'unavailable', 'reason': 'reader_refused'},
      'accounts': <Object>[],
      'buckets': <Object>[],
    },
    {
      'id': 'macbook1',
      'label': 'Macbook1',
      'quota': {'kind': 'unavailable', 'reason': 'not_configured'},
      'accounting': {'kind': 'unavailable', 'reason': 'not_configured'},
      'accounts': <Object>[],
      'buckets': <Object>[],
    },
    {
      // A publisher from before reasons existed.
      'id': 'legacy',
      'label': 'Legacy',
      'quota': {'kind': 'unavailable'},
      'accounting': {'kind': 'unavailable'},
      'accounts': <Object>[],
      'buckets': <Object>[],
    },
  ];
  return FleetUsage.parse(
    jsonDecode(
          jsonEncode({
            'receivedAt': fresh.toIso8601String(),
            'snapshot': {'v': 1, 'machines': machines},
          }),
        )
        as Map<String, dynamic>,
  );
}

void main() {
  test('parses unread reasons and a third window row', () {
    final usage = _usage(DateTime.now().toUtc());
    expect(usage.machines[2].quota.reason, 'reader_refused');
    expect(usage.machines[4].quota.reason, isNull);
    expect(usage.machines.first.accounts[1].windows.last.kind, 'monthly');
  });

  test('confirms no account can run only on fresh, unexpired evidence', () {
    final now = DateTime.utc(2026, 11, 22, 3, 15);
    UsageAccount limited({
      Duration checkedAgo = const Duration(minutes: 5),
      DateTime? resetsAt,
    }) => (
      id: 'personal',
      provider: 'claudeAgent',
      instance: 'personal',
      email: null,
      plan: null,
      checkedAt: now.subtract(checkedAgo),
      status: 'limited',
      reason: 'weekly',
      windows: [(kind: 'weekly', usedPercent: 100.0, resetsAt: resetsAt)],
    );
    expect(usageNoneAvailable('complete', [limited()], now), isTrue);
    expect(
      usageNoneAvailable('complete', [
        limited(resetsAt: now.add(const Duration(hours: 1))),
      ], now),
      isTrue,
    );
    // A check older than the account limit no longer confirms it.
    expect(
      usageNoneAvailable('complete', [
        limited(checkedAgo: const Duration(minutes: 20)),
      ], now),
      isFalse,
    );
    // The limit's reset has passed, so the account may run again.
    expect(
      usageNoneAvailable('complete', [
        limited(resetsAt: now.subtract(const Duration(minutes: 1))),
      ], now),
      isFalse,
    );
    // A partial reading may have left an available account out.
    expect(usageNoneAvailable('partial', [limited()], now), isFalse);
    // Signed in without a quota window is unread, not blocked.
    final silent = limited();
    expect(
      usageNoneAvailable('complete', [
        (
          id: silent.id,
          provider: silent.provider,
          instance: silent.instance,
          email: null,
          plan: null,
          checkedAt: silent.checkedAt,
          status: 'unknown',
          reason: 'not_reported',
          windows: const <UsageWindow>[],
        ),
      ], now),
      isFalse,
    );
    expect(usageNoneAvailable('complete', const [], now), isFalse);
  });

  testWidgets('says why each machine has no current quota', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 4000);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpApp(UsageContent(usage: _usage(DateTime.now().toUtc())));
    await tester.pump();

    // A five-minute-old account check still counts as current.
    expect(find.text('personal'), findsWidgets);
    expect(
      find.text(
        'No account can run now. Each one is limited, signed out or '
        'disabled.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'This machine refused the usage reader credential. Issue a new '
        'reader token.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'No usage reader is set up for this machine, so its quota is not read.',
      ),
      findsOneWidget,
    );
    expect(find.text('No current quota confirmed'), findsOneWidget);
    expect(find.text('Monthly limit reached.'), findsOneWidget);
    expect(find.textContaining('Monthly used'), findsOneWidget);

    expect(
      find.text('No usage records from C02, Macbook1, Legacy.'),
      findsOneWidget,
    );
    expect(
      find.text(
        '420 usage records have no price, so cost totals leave them out.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
