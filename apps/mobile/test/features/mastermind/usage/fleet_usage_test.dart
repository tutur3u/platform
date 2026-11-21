import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/usage/fleet_usage.dart';
import 'package:mobile/features/mastermind/usage/usage_content.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/pump_app.dart';

void main() {
  test(
    'reads account scope and keeps unreported windows and prices absent',
    () {
      final body = jsonDecode(
        jsonEncode({
          'receivedAt': '2026-11-21T11:25:00Z',
          'snapshot': {
            'v': 1,
            'machines': [
              {
                'id': 'm4',
                'label': 'M4',
                'quota': {
                  'kind': 'complete',
                  'observedAt': '2026-11-21T11:24:00Z',
                },
                'accounting': {'kind': 'unavailable'},
                'accounts': [
                  {
                    'id': 'codex',
                    'provider': 'codex',
                    'instance': 'Work',
                    'email': 'owner@example.com',
                    'plan': null,
                    'checkedAt': '2026-11-21T18:24:00+07:00',
                    'status': {'kind': 'limited', 'reason': 'weekly'},
                    'windows': [
                      {
                        'kind': 'weekly',
                        'usedPercent': 100,
                        'resetsAt': '2026-11-21T19:24:00+07:00',
                      },
                    ],
                  },
                ],
                'buckets': [
                  {
                    'day': '2026-11-21',
                    'provider': 'codex',
                    'model': 'fixture-model',
                    'accountId': null,
                    'uncachedInputTokens': 1,
                    'cachedInputTokens': 0,
                    'cacheCreationTokens': 0,
                    'outputTokens': 1,
                    'unpricedRecords': 1,
                    'costUsd': null,
                  },
                ],
              },
            ],
          },
        }),
      ) as Map<String, dynamic>;
      final usage = FleetUsage.parse(body);
      final machine = usage.machines.single;
      final account = machine.accounts.single;
      expect(account.email, 'owner@example.com');
      expect(account.windows.single.kind, 'weekly');
      expect(
        account.windows.single.resetsAt,
        DateTime.utc(2026, 11, 21, 12, 24),
      );
      expect(account.checkedAt, DateTime.utc(2026, 11, 21, 11, 24));
      expect(machine.accounting.observedAt, isNull);
      expect(machine.buckets.single.cost, isNull);
      expect(machine.buckets.single.accountId, isNull);
    },
  );
  testWidgets('Vietnamese usage table clears the shell dock at large text', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    final time = DateTime.utc(2026, 11, 21);
    final usage = FleetUsage(
      receivedAt: time,
      machines: [
        (
          id: 'm4',
          label: 'M4',
          quota: (kind: 'unavailable', observedAt: null),
          accounting: (kind: 'complete', observedAt: time),
          accounts: [],
          buckets: [
            (
              day: '2026-11-21',
              provider: 'codex',
              model: 'fixture-model',
              accountId: null,
              input: 200,
              cacheRead: 10,
              cacheWrite: 5,
              output: 30,
              unpriced: 0,
              cost: 0.5,
            ),
          ],
        ),
      ],
    );
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            padding: const EdgeInsets.only(bottom: 120),
            textScaler: const TextScaler.linear(2),
          ),
          child: Localizations.override(
            context: context,
            locale: const Locale('vi'),
            delegates: AppLocalizations.localizationsDelegates,
            child: UsageContent(usage: usage, refreshFailed: true),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Không thể làm mới'), findsOneWidget);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -5000));
    await tester.pumpAndSettle();
    expect(find.text('Mức sử dụng token'), findsOneWidget);
    expect(
      tester.getRect(find.byType(DataTable)).bottom,
      lessThanOrEqualTo(680),
    );
    expect(find.byType(AppBar), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
