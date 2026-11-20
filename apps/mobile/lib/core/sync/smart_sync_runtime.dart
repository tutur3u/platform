import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/sync/smart_sync.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract final class SmartSyncRuntime {
  static const _platform = MethodChannel('mobile/smart_sync');

  static const _pushHintKey = 'mobile-smart-sync-push-hint';
  static Future<bool> Function(SyncTrigger, Set<String>?)? _refresh;
  static _OsSyncHint? _osHint;
  static final _hintOwner = Object();

  static final _scheduler = SmartSync(backgroundAllowed: _backgroundAllowed);

  static void Function() bind({
    required String? Function() currentUserId,
    required String? Function() currentWorkspaceId,
    required Stream<String?> workspaceChanges,
  }) {
    final unbindCache = CacheStore.instance.bindSmartSync(
      _scheduler,
      currentWorkspaceId: currentWorkspaceId,
    );
    Future<bool> refresh(SyncTrigger trigger, Set<String>? completedOsKeys) =>
        CacheStore.awaitRevalidation(
          () => ApiClient.offlinePreparation(
            () => CacheStore.instance.refreshCachedResources(
              currentUserId: currentUserId,
              trigger: trigger,
              completedOsKeys: completedOsKeys,
            ),
            allowChallenge: false,
            markBulk: false,
          ),
        ).catchError((Object error) => false);

    _refresh = refresh;
    var workspaceId = currentWorkspaceId();
    final workspaceSubscription = workspaceChanges.listen((next) {
      if (workspaceId != next) reset();
      workspaceId = next;
    });
    var wasOffline = false;
    final subscription = Connectivity().onConnectivityChanged.listen((
      connections,
    ) {
      final offline = connections.every(
        (connection) => connection == ConnectivityResult.none,
      );
      if (wasOffline && !offline) request(SyncTrigger.reconnect);
      wasOffline = offline;
    }, onError: (Object error) {});
    return () {
      if (identical(_refresh, refresh)) _refresh = null;
      unawaited(subscription.cancel());
      unawaited(workspaceSubscription.cancel());
      unbindCache();
      reset();
    };
  }

  static void request(SyncTrigger trigger) =>
      unawaited(_refresh?.call(trigger, null));

  static bool isSilentHint(Map<String, dynamic> data) =>
      data['syncHint'] == '1';

  static Future<void> recordSilentHint() async {
    try {
      await SharedPreferencesAsync().setBool(_pushHintKey, true);
    } on Exception {
      // A later resume can still use the ordinary cache TTL.
    }
  }

  static void resume({required bool Function() signedIn}) {
    unawaited(_resume(signedIn));
  }

  static Future<void> _resume(bool Function() signedIn) async {
    if (!signedIn()) return;
    request(SyncTrigger.resume);
    unawaited(_refreshOsHint(signedIn));
    try {
      final prefs = SharedPreferencesAsync();
      final pushHint = await prefs.getBool(_pushHintKey) ?? false;
      if (pushHint && signedIn()) {
        await prefs.remove(_pushHintKey);
        if (signedIn()) request(SyncTrigger.pushHint);
      }
    } on Exception {
      // A stored hint is optional.
    }
  }

  static void pushHint() {
    ForegroundRefresh.request(_hintOwner, () => request(SyncTrigger.pushHint));
  }

  static Future<bool> _backgroundAllowed() async {
    try {
      return await _platform.invokeMethod<bool>('backgroundAllowed') ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static void reset() {
    _scheduler.reset();
    _osHint = null;
  }

  static void accountChanged({required bool signedIn}) {
    reset();
    if (!signedIn) unawaited(cancelOsRefresh());
  }

  static Future<void> _refreshOsHint(bool Function() signedIn) async {
    try {
      final token = await _platform.invokeMethod<String>(
        'peekOsHintAndSchedule',
      );
      final refresh = _refresh;
      if (token == null || refresh == null || !signedIn()) return;
      if (_osHint?.token != token) _osHint = _OsSyncHint(token);
      final hint = _osHint!;
      if (hint.running) return;
      hint.running = true;
      try {
        if (await refresh(SyncTrigger.osRefresh, hint.completedKeys) &&
            identical(_osHint, hint) &&
            signedIn()) {
          await _platform.invokeMethod<void>('completeOsHint', token);
        }
      } finally {
        hint.running = false;
      }
    } on PlatformException {
      // Preserve the native hint if delivery or acknowledgment fails.
    } on MissingPluginException {
      // The host has no native background scheduler.
    }
  }

  static Future<void> cancelOsRefresh() async {
    try {
      await _platform.invokeMethod<void>('cancelOsRefresh');
    } on PlatformException {
      // Native background work is best effort.
    } on MissingPluginException {
      // The host has no native background scheduler.
    }
  }
}

class _OsSyncHint {
  _OsSyncHint(this.token);

  final String token;
  final completedKeys = <String>{};
  bool running = false;
}
