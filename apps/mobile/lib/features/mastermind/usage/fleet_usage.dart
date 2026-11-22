import 'package:mobile/data/sources/api_client.dart';

const usageStaleAfter = Duration(minutes: 2);

/// T3 rechecks some providers' limits only every few minutes, so an account
/// reading is judged against its own original check time on this longer clock.
const quotaCheckStaleAfter = Duration(minutes: 15);

/// Window rows the client reads per account; publishers send at most two.
const _windowLimit = 3;

typedef UsageWindow = ({String kind, double? usedPercent, DateTime? resetsAt});
typedef UsageAccount = ({
  String id,
  String provider,
  String instance,
  String? email,
  String? plan,
  DateTime? checkedAt,
  String status,
  String? reason,
  List<UsageWindow> windows,
});
typedef UsageBucket = ({
  String day,
  String provider,
  String model,
  String? accountId,
  int input,
  int cacheRead,
  int cacheWrite,
  int output,
  int unpriced,
  double? cost,
});
typedef UsageObservation = ({
  String kind,
  DateTime? observedAt,
  String? reason,
});
typedef UsageMachine = ({
  String id,
  String label,
  UsageObservation quota,
  UsageObservation accounting,
  List<UsageAccount> accounts,
  List<UsageBucket> buckets,
});

class FleetUsage {
  const FleetUsage({required this.machines, required this.receivedAt});

  factory FleetUsage.parse(Map<String, dynamic> json) {
    final snapshot = _object(json['snapshot']);
    if (snapshot['v'] != 1) {
      throw const FormatException('Unsupported usage snapshot');
    }
    final receivedAt = _date(json['receivedAt']);
    if (receivedAt == null) throw const FormatException('Invalid receipt date');
    return FleetUsage(
      machines: _list(snapshot['machines'], 12, _machine),
      receivedAt: receivedAt,
    );
  }

  final List<UsageMachine> machines;
  final DateTime receivedAt;
}

class FleetUsageSource {
  FleetUsageSource({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  Future<FleetUsage> fetch() async =>
      FleetUsage.parse(await _api.getJson('/api/v1/mastermind/fleet/usage'));
}

Map<String, dynamic> _object(Object? value) {
  if (value is Map<String, dynamic>) return value;
  throw const FormatException('Invalid usage object');
}

List<T> _list<T>(
  Object? value,
  int limit,
  T Function(Map<String, dynamic>) parse,
) {
  if (value is! List<dynamic> || value.length > limit) {
    throw const FormatException('Invalid usage list');
  }
  return value.map((row) => parse(_object(row))).toList(growable: false);
}

String _text(Object? value) {
  if (value is String && value.isNotEmpty) return value;
  throw const FormatException('Invalid usage text');
}

DateTime? _date(Object? raw) =>
    raw is String ? DateTime.tryParse(raw)?.toUtc() : null;

String? _optionalText(Object? raw) => raw is String ? raw : null;

double? _number(Object? raw) =>
    raw is num && raw.isFinite && raw >= 0 ? raw.toDouble() : null;

int _count(Object? raw) {
  if (raw is int && raw >= 0) return raw;
  throw const FormatException('Invalid usage count');
}

UsageObservation _observation(Map<String, dynamic> raw) => (
  kind: _text(raw['kind']),
  observedAt: _date(raw['observedAt']),
  reason: _optionalText(raw['reason']),
);

UsageWindow _window(Map<String, dynamic> raw) => (
  kind: _text(raw['kind']),
  usedPercent: _number(raw['usedPercent']),
  resetsAt: _date(raw['resetsAt']),
);

UsageAccount _account(Map<String, dynamic> raw) {
  final status = _object(raw['status']);
  return (
    id: _text(raw['id']),
    provider: _text(raw['provider']),
    instance: _text(raw['instance']),
    email: _optionalText(raw['email']),
    plan: _optionalText(raw['plan']),
    checkedAt: _date(raw['checkedAt']),
    status: _text(status['kind']),
    reason: _optionalText(status['reason']),
    windows: _list(raw['windows'], _windowLimit, _window),
  );
}

UsageBucket _bucket(Map<String, dynamic> raw) => (
  day: _text(raw['day']),
  provider: _text(raw['provider']),
  model: _text(raw['model']),
  accountId: _optionalText(raw['accountId']),
  input: _count(raw['uncachedInputTokens']),
  cacheRead: _count(raw['cachedInputTokens']),
  cacheWrite: _count(raw['cacheCreationTokens']),
  output: _count(raw['outputTokens']),
  unpriced: _count(raw['unpricedRecords']),
  cost: _number(raw['costUsd']),
);

UsageMachine _machine(Map<String, dynamic> raw) => (
  id: _text(raw['id']),
  label: _text(raw['label']),
  quota: _observation(_object(raw['quota'])),
  accounting: _observation(_object(raw['accounting'])),
  accounts: _list(raw['accounts'], 32, _account),
  buckets: _list(raw['buckets'], 384, _bucket),
);
