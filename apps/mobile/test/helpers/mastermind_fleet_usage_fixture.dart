import 'package:mobile/features/mastermind/usage/fleet_usage.dart';

const fleetUsageEmail = 'owner@example.test';
const fleetUsageMachine = 'Fixture Mac';
const fleetUsageInstance = 'Fixture Codex';
const fleetUsageModel = 'codex · fixture-model';

FleetUsage fleetUsageFixture({
  DateTime? receivedAt,
  DateTime? checkedAt,
  bool empty = false,
  double? sessionUsed = 25,
  DateTime? sessionReset,
  DateTime? weeklyReset,
}) {
  final receipt = receivedAt ?? DateTime.now().toUtc();
  final checked = checkedAt ?? receipt;
  final observation = {
    'kind': 'complete',
    'observedAt': checked.toIso8601String(),
  };
  return FleetUsage.parse({
    'receivedAt': receipt.toIso8601String(),
    'snapshot': {
      'v': 1,
      'machines': [
        if (!empty)
          {
            'id': 'fixture-mac',
            'label': fleetUsageMachine,
            'quota': observation,
            'accounting': observation,
            'accounts': [
              {
                'id': 'fixture-codex',
                'provider': 'codex',
                'instance': fleetUsageInstance,
                'email': fleetUsageEmail,
                'plan': 'Pro',
                'checkedAt': checked.toIso8601String(),
                'status': {'kind': 'available'},
                'windows': [
                  {
                    'kind': 'session',
                    'usedPercent': sessionUsed,
                    'resetsAt': sessionReset?.toIso8601String(),
                  },
                  if (weeklyReset != null)
                    {
                      'kind': 'weekly',
                      'usedPercent': 50,
                      'resetsAt': weeklyReset.toIso8601String(),
                    },
                ],
              },
            ],
            'buckets': [
              {
                'day': '2026-11-21',
                'provider': 'codex',
                'model': 'fixture-model',
                'accountId': 'fixture-codex',
                'uncachedInputTokens': 42,
                'cachedInputTokens': 12,
                'cacheCreationTokens': 3,
                'outputTokens': 9,
                'unpricedRecords': 0,
                'costUsd': 2.5,
              },
            ],
          },
      ],
    },
  });
}

class FakeFleetUsageSource implements FleetUsageSource {
  FakeFleetUsageSource(this.usage);

  final FleetUsage usage;
  Exception? error;

  @override
  Future<FleetUsage> fetch() async {
    if (error case final failure?) throw failure;
    return usage;
  }
}
