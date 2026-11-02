import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';

export 'mobile_flag.dart';

typedef MobileFlagsFetch =
    Future<Map<String, dynamic>?> Function(String workspaceId, String? version);

class MobileFlagsState {
  MobileFlagsState([Map<MobileFlag, bool> flags = const {}])
    : _flags = Map.unmodifiable(flags);

  final Map<MobileFlag, bool> _flags;

  bool enabled(MobileFlag flag) =>
      (flag == MobileFlag.mobileOffline ||
          !flag.key.startsWith('offline_') ||
          _flags[MobileFlag.mobileOffline] == true) &&
      _flags[flag] == true;
}

/// Account/workspace-scoped cached flags. Network work never blocks app startup.
class MobileFlags extends Cubit<MobileFlagsState> {
  MobileFlags({
    CacheStore? cache,
    MobileFlagsFetch? fetch,
    Stream<List<ConnectivityResult>>? networkEvents,
  }) : _cache = cache ?? CacheStore.instance,
       _api = fetch == null ? ApiClient() : null,
       _fetch = fetch,
       super(MobileFlagsState()) {
    _networkSubscription =
        (networkEvents ?? Connectivity().onConnectivityChanged).listen(
          (interfaces) {
            final connected = interfaces.any(
              (value) => value != ConnectivityResult.none,
            );
            final reconnect = connected && !_connected;
            _connected = connected;
            if (reconnect && _foreground) unawaited(refresh());
          },
          onError: (Object _) {
            // Resume and TTL polling remain available without platform events.
          },
        );
  }

  final CacheStore _cache;
  final ApiClient? _api;
  final MobileFlagsFetch? _fetch;
  String? _userId;
  String? _workspaceId;
  Map<String, dynamic>? _payload;
  Map<MobileFlag, bool>? _override;
  Timer? _timer;
  StreamSubscription<List<ConnectivityResult>>? _networkSubscription;
  Future<void> _clearing = Future<void>.value();
  bool _foreground = true;
  bool _connected = true;

  void setForeground({required bool foreground}) {
    if (_foreground == foreground) return;
    _foreground = foreground;
    if (foreground) {
      unawaited(refresh());
    } else {
      _timer?.cancel();
    }
  }

  int _revision = 0;
  int? _refreshing;

  bool enabled(MobileFlag flag) => state.enabled(flag);

  /// Overrides still obey the master kill switch.
  Map<MobileFlag, bool>? get debugOverride =>
      _override == null ? null : Map.unmodifiable(_override!);

  set debugOverride(Map<MobileFlag, bool>? flags) {
    _override = flags == null ? null : Map.of(flags);
    _publish();
  }

  Future<void> setScope({String? userId, String? workspaceId}) async {
    if (_userId == userId && _workspaceId == workspaceId) return;
    final previousUser = _userId;
    _revision++;
    _timer?.cancel();
    _userId = userId;
    _workspaceId = workspaceId;
    _payload = null;
    if (userId == null) {
      _override = null;
    }
    _publish();
    if (userId == null && previousUser != null) {
      _clearing = _cache.clearScope(
        userId: previousUser,
        namespace: 'mobile.featureFlags',
      );
      await _clearing;
    }
    if (userId != null && workspaceId != null) {
      await _restore(_revision, userId, workspaceId);
    }
  }

  CacheKey _key(String user, String workspace) => CacheKey(
    namespace: 'mobile.featureFlags',
    userId: user,
    workspaceId: workspace,
  );

  Future<void> _restore(int revision, String user, String workspace) async {
    try {
      await _clearing;
      if (!_current(revision)) return;
      final cached = await _cache.read<Map<String, dynamic>>(
        key: _key(user, workspace),
        decode: (json) => _validate(Map<String, dynamic>.from(json! as Map)),
      );
      if (!_current(revision)) return;
      _payload = cached.data;
      _publish();
      if (_payload != null) {
        // Upgrade snapshots written with the former finite retention policy.
        await _persist(revision, user, workspace);
      }
    } on Object {
      // An unavailable cache must not prevent a fresh request.
    }
    if (_current(revision)) await refresh();
  }

  bool _current(int revision) => !isClosed && revision == _revision;

  Future<void> refresh() async {
    final user = _userId;
    final workspace = _workspaceId;
    final revision = _revision;
    if (isClosed ||
        !_foreground ||
        user == null ||
        workspace == null ||
        _refreshing == revision) {
      return;
    }
    _timer?.cancel();
    _refreshing = revision;
    try {
      final version = _payload?['version'] as String?;
      final payload = await ApiClient.runForUser(
        user,
        () => _fetch != null
            ? _fetch(workspace, version)
            : _api!.getConditionalJson(
                '/api/v1/mobile/feature-flags?wsId=${Uri.encodeQueryComponent(workspace)}',
                version: version,
              ),
      );
      if (!_current(revision)) return;
      if (payload != null) {
        _payload = _validate(payload);
        _publish();
        await _persist(revision, user, workspace);
      }
    } on Object {
      // Offline or invalid responses retain the last scoped payload.
    } finally {
      if (_refreshing == revision) _refreshing = null;
      if (_current(revision) && _foreground) {
        _timer = Timer(
          Duration(seconds: _payload?['ttlSeconds'] as int? ?? 30),
          () => unawaited(refresh()),
        );
      }
    }
  }

  Future<void> _persist(int revision, String user, String workspace) =>
      _cache.write(
        key: _key(user, workspace),
        policy: const CachePolicy(
          staleAfter: Duration.zero,
          expireAfter: Duration.zero,
          neverExpires: true,
          refreshOnResume: false,
          refreshOnReconnect: false,
          allowBackgroundRefresh: false,
        ),
        payload: _payload,
        checkScope: () {
          if (!_current(revision)) throw StateError('Flags scope changed');
        },
      );

  static Map<String, dynamic> _validate(Map<String, dynamic> payload) {
    if (payload['version'] is! String ||
        payload['flags'] is! Map ||
        payload['ttlSeconds'] is! int ||
        (payload['ttlSeconds'] as int) <= 0) {
      throw const FormatException('Invalid mobile flags payload');
    }
    return {
      'version': payload['version'],
      'ttlSeconds': payload['ttlSeconds'],
      'flags': {
        for (final flag in MobileFlag.values)
          flag.key: (payload['flags'] as Map)[flag.key] == true,
      },
    };
  }

  void _publish() {
    if (isClosed) return;
    final flags = _payload?['flags'] as Map?;
    emit(
      MobileFlagsState(
        _override ??
            {
              for (final flag in MobileFlag.values)
                flag: flags?[flag.key] == true,
            },
      ),
    );
  }

  @override
  Future<void> close() async {
    _revision++;
    _timer?.cancel();
    await _networkSubscription?.cancel();
    _api?.dispose();
    await super.close();
  }
}
