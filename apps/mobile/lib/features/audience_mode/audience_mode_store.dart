import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';

/// The stored mode layers for one account in one workspace.
class AudienceModeLayers extends Equatable {
  const AudienceModeLayers({
    this.personal,
    this.workspaceDefault,
    this.account,
  });

  factory AudienceModeLayers.fromJson(Object? json) {
    final map = json is Map ? json : const <String, Object?>{};
    return AudienceModeLayers(
      personal: AudienceMode.parse(map['override']),
      workspaceDefault: AudienceMode.parse(map['workspaceDefault']),
      account: AudienceMode.parse(map['account']),
    );
  }

  /// This account's choice for the workspace (`user_workspace_configs`).
  final AudienceMode? personal;
  final AudienceMode? workspaceDefault;
  final AudienceMode? account;

  ResolvedAudienceMode get resolved => resolveAudienceMode(
    override: personal,
    workspaceDefault: workspaceDefault,
    account: account,
  );

  AudienceModeLayers withPersonal(AudienceMode? value) => AudienceModeLayers(
    personal: value,
    workspaceDefault: workspaceDefault,
    account: account,
  );

  AudienceModeLayers withWorkspaceDefault(AudienceMode? value) =>
      AudienceModeLayers(
        personal: personal,
        workspaceDefault: value,
        account: account,
      );

  AudienceModeLayers withAccount(AudienceMode? value) => AudienceModeLayers(
    personal: personal,
    workspaceDefault: workspaceDefault,
    account: value,
  );

  Map<String, Object?> toJson() => {
    'override': personal?.wireValue,
    'workspaceDefault': workspaceDefault?.wireValue,
    'account': account?.wireValue,
  };

  @override
  List<Object?> get props => [personal, workspaceDefault, account];
}

/// Last known layers per (user, workspace), so the first frame after a cold
/// start or offline launch already shows the right mode.
abstract interface class AudienceModeSnapshotStore {
  AudienceModeLayers? peek(String userId, String wsId);

  Future<AudienceModeLayers?> read(String userId, String wsId);

  Future<void> write(String userId, String wsId, AudienceModeLayers layers);
}

/// The encrypted [CacheStore], scoped by user and workspace.
class CacheAudienceModeSnapshotStore implements AudienceModeSnapshotStore {
  CacheAudienceModeSnapshotStore({CacheStore? store})
    : _store = store ?? CacheStore.instance;

  final CacheStore _store;

  static CacheKey _key(String userId, String wsId) => CacheKey(
    namespace: 'audience_mode.layers',
    userId: userId,
    workspaceId: wsId,
  );

  @override
  AudienceModeLayers? peek(String userId, String wsId) => _store
      .peek(key: _key(userId, wsId), decode: AudienceModeLayers.fromJson)
      .data;

  @override
  Future<AudienceModeLayers?> read(String userId, String wsId) async =>
      (await _store.read(
        key: _key(userId, wsId),
        decode: AudienceModeLayers.fromJson,
      )).data;

  @override
  Future<void> write(String userId, String wsId, AudienceModeLayers layers) =>
      _store.write(
        key: _key(userId, wsId),
        policy: CachePolicies.offlineCatalog,
        payload: layers.toJson(),
        tags: ['workspace:$wsId', 'module:audience_mode'],
      );
}
