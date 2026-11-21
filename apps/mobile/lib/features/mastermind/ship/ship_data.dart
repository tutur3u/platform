import 'package:mobile/data/sources/api_client.dart';

/// The ship snapshot Web serves at `/api/v1/mastermind/fleet/ship`: what is
/// live per app and environment, its CI state, the pending release and the
/// freshness of each named source. The Cron Control collector writes it every
/// two minutes; see apps/docs/build/devops/mastermind-ship-collector.mdx.
/// Parsing is strict: a value outside the contract is unreadable, never
/// rendered as current.

const shipPath = '/api/v1/mastermind/fleet/ship';
const shipInterval = Duration(minutes: 2);
const shipStaleAfter = Duration(minutes: 6);

enum ShipSourceState { ok, error, backoff, unconfigured }

enum ShipCi { success, failure, pending, none }

enum ShipDeploy { ok, failed, running }

typedef ShipSource = ({
  String id,
  ShipSourceState state,
  DateTime? checkedAt,
  DateTime? okAt,
  DateTime? retryAt,
});

typedef ShipRelease = ({
  String sha,
  DateTime deployedAt,
  String environment,
  ShipCi ci,
  ShipDeploy deploy,
});

typedef ShipWorker = ({String versionId, double percentage, String? sha});

typedef ShipEnvironment = ({ShipRelease? release, ShipWorker? worker});

typedef ShipPending = ({int commits, bool capped, DateTime? oldestAt});

typedef ShipApp = ({
  String id,
  String name,
  String? repository,
  ShipEnvironment production,
  ShipEnvironment? staging,
  ShipPending? pending,
  List<String> sources,
});

class ShipSnapshot {
  const ShipSnapshot({
    required this.collectedAt,
    required this.sources,
    required this.apps,
  });

  factory ShipSnapshot.parse(Map<String, dynamic> json) {
    final snapshot = _object(json['snapshot']);
    if (snapshot['version'] != 1) {
      throw const FormatException('Unsupported ship snapshot');
    }
    return ShipSnapshot(
      collectedAt: _required(snapshot['collectedAt']),
      sources: _list(snapshot['sources'], 16, _source),
      apps: _list(snapshot['apps'], 32, _app),
    );
  }

  final DateTime collectedAt;
  final List<ShipSource> sources;
  final List<ShipApp> apps;
}

enum ShipCheckState {
  checked,
  rateLimited,
  stopped,
  disabled,
  unconfigured,
  failed,
}

typedef ShipCheckResult = ({ShipCheckState state, Duration? retryAfter});

class ShipLiveSource {
  ShipLiveSource({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  /// [fresh] skips Web's few-second read cache (the read after Check now).
  Future<ShipSnapshot> fetch({bool fresh = false}) async => ShipSnapshot.parse(
    await _api.getJson(fresh ? '$shipPath?fresh=1' : shipPath),
  );

  /// Owner "Check now". Cron Control allows one run per 30 seconds.
  Future<ShipCheckResult> check() async {
    try {
      await _api.postJson(
        '$shipPath/check',
        const <String, dynamic>{},
        timeout: const Duration(seconds: 50),
      );
      return (state: ShipCheckState.checked, retryAfter: null);
    } on ApiException catch (error) {
      return switch (error.statusCode) {
        429 => (
          state: ShipCheckState.rateLimited,
          retryAfter: Duration(seconds: error.retryAfter ?? 30),
        ),
        // Web names the state in `code`: the job is stopped or not enabled.
        409 => (
          state: error.code == 'disabled'
              ? ShipCheckState.disabled
              : ShipCheckState.stopped,
          retryAfter: null,
        ),
        503 => (state: ShipCheckState.unconfigured, retryAfter: null),
        _ => (state: ShipCheckState.failed, retryAfter: null),
      };
    }
  }
}

final _sha = RegExp(r'^[0-9a-f]{40}$');

Map<String, dynamic> _object(Object? value) {
  if (value is Map<String, dynamic>) return value;
  throw const FormatException('Invalid ship object');
}

List<T> _list<T>(Object? value, int limit, T Function(Map<String, dynamic>) f) {
  if (value is! List<dynamic> || value.length > limit) {
    throw const FormatException('Invalid ship list');
  }
  return [for (final item in value) f(_object(item))];
}

DateTime _required(Object? value) =>
    _date(value) ?? (throw const FormatException('Missing ship date'));

DateTime? _date(Object? value) {
  if (value == null) return null;
  if (value is! String) throw const FormatException('Invalid ship date');
  return DateTime.parse(value).toUtc();
}

String _string(Object? value, {int max = 100}) {
  if (value is String && value.isNotEmpty && value.length <= max) return value;
  throw const FormatException('Invalid ship string');
}

T _enum<T extends Enum>(List<T> values, Object? wire) => values.firstWhere(
  (value) => value.name == wire,
  orElse: () => throw const FormatException('Invalid ship state'),
);

ShipSource _source(Map<String, dynamic> json) => (
  id: _string(json['id'], max: 60),
  state: _enum(ShipSourceState.values, json['state']),
  checkedAt: _date(json['checkedAt']),
  okAt: _date(json['okAt']),
  retryAt: _date(json['retryAt']),
);

ShipRelease? _release(Object? value) {
  if (value == null) return null;
  final json = _object(value);
  final sha = _string(json['sha'], max: 40);
  if (!_sha.hasMatch(sha)) throw const FormatException('Invalid ship SHA');
  return (
    sha: sha,
    deployedAt: _required(json['deployedAt']),
    environment: _string(json['environment']),
    ci: _enum(ShipCi.values, json['ci']),
    deploy: _enum(ShipDeploy.values, json['deploy']),
  );
}

final _maxDate = DateTime.utc(9999);
final _script = RegExp(r'^[a-z0-9][a-z0-9-]{0,62}$');
final _versionId = RegExp(r'^[0-9a-f-]{8,64}$');

ShipWorker? _worker(Object? value) {
  if (value == null) return null;
  final json = _object(value);
  final percentage = json['percentage'];
  final sha = json['sha'];
  if (!_script.hasMatch(_string(json['script'], max: 63)) ||
      percentage is! num ||
      percentage < 0 ||
      percentage > 100 ||
      _required(json['deployedAt']).isAfter(_maxDate) ||
      (sha != null && (sha is! String || !_sha.hasMatch(sha)))) {
    throw const FormatException('Invalid ship worker');
  }
  final versionId = _string(json['versionId'], max: 64);
  if (!_versionId.hasMatch(versionId)) {
    throw const FormatException('Invalid ship worker version');
  }
  return (
    versionId: versionId,
    percentage: percentage.toDouble(),
    sha: sha as String?,
  );
}

ShipEnvironment? _environment(Object? value) {
  if (value == null) return null;
  final json = _object(value);
  return (release: _release(json['release']), worker: _worker(json['worker']));
}

ShipPending? _pending(Object? value) {
  if (value == null) return null;
  final json = _object(value);
  final commits = json['commits'];
  final capped = json['capped'];
  final head = json['headSha'];
  if (commits is! int ||
      commits < 0 ||
      commits > 10000 ||
      capped is! bool ||
      head is! String ||
      !_sha.hasMatch(head)) {
    throw const FormatException('Invalid ship pending');
  }
  return (commits: commits, capped: capped, oldestAt: _date(json['oldestAt']));
}

ShipApp _app(Map<String, dynamic> json) {
  final sources = json['sources'];
  if (sources is! List<dynamic> || sources.length > 4) {
    throw const FormatException('Invalid ship sources');
  }
  return (
    id: _string(json['id'], max: 40),
    name: _string(json['name']),
    repository: json['repository'] == null ? null : _string(json['repository']),
    production:
        _environment(json['production']) ??
        (throw const FormatException('Missing ship production')),
    staging: _environment(json['staging']),
    pending: _pending(json['pending']),
    sources: [for (final id in sources) _string(id, max: 60)],
  );
}
