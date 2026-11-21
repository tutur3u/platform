import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';

/// Locks the app after the chosen delay away and holds app-owned refreshes
/// until the lock clears.
///
/// With App Lock on, the native side keeps the app-switcher preview private:
/// iOS blurs the window only after the app enters the background and removes
/// the blur before it returns; Android 13 and later hide the Recents
/// thumbnail. Nothing here covers the live UI or waits on a native handshake.
class AppLockLifecycle with WidgetsBindingObserver {
  AppLockLifecycle({
    required AppLockCubit lock,
    required String? Function() accountIdentity,
    required ValueChanged<AppLifecycleState> onSuspend,
    required VoidCallback refresh,
    DateTime Function()? now,
    TargetPlatform? snapshotPlatform,
  }) : _lock = lock,
       _accountIdentity = accountIdentity,
       _onSuspend = onSuspend,
       _refresh = refresh,
       _now = now ?? DateTime.now,
       _snapshotPlatform =
           snapshotPlatform ??
           (kIsWeb
               ? null
               : Platform.isAndroid
               ? TargetPlatform.android
               : Platform.isIOS
               ? TargetPlatform.iOS
               : null) {
    _subscription = _lock.stream.listen((_) => accountOrLockChanged());
    _unbindRefresh = ForegroundRefresh.bind(_enqueue);
    _syncRecentsPrivacy();
    WidgetsBinding.instance.addObserver(this);
  }

  static const _snapshot = MethodChannel('mobile/app_snapshot_privacy');

  final AppLockCubit _lock;
  final String? Function() _accountIdentity;
  final TargetPlatform? _snapshotPlatform;
  final ValueChanged<AppLifecycleState> _onSuspend;
  final VoidCallback _refresh;
  final DateTime Function() _now;

  late final StreamSubscription<AppLockState> _subscription;
  late final VoidCallback _unbindRefresh;
  final _featureWork = <Object, VoidCallback>{};
  bool? _recentsHidden;
  DateTime? _backgroundedAt;
  bool _wasInBackground = false;
  bool _frameScheduled = false;
  bool _refreshPending = false;
  bool _disposed = false;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final returning =
        _wasInBackground &&
        (state == AppLifecycleState.inactive ||
            state == AppLifecycleState.resumed);
    _wasInBackground =
        state == AppLifecycleState.paused || state == AppLifecycleState.hidden;
    // Lock on the first event back from the background, before the resumed
    // frame, so the returning scene draws the lock screen first.
    if (returning) _lockIfElapsed(clearWhenEarly: false);
    if (state != AppLifecycleState.resumed) {
      if (_wasInBackground ||
          (!returning &&
              state == AppLifecycleState.inactive &&
              _lock.state.delay != AppLockDelay.immediately)) {
        _backgroundedAt ??= _now();
      }
      _onSuspend(state);
      return;
    }

    _lockIfElapsed();
    _refreshPending = true;
    scheduleRefresh();
  }

  /// Locks when the delay has run out. An early check on the way back keeps
  /// the timestamp so the resumed check still counts the full time away.
  void _lockIfElapsed({bool clearWhenEarly = true}) {
    final backgroundedAt = _backgroundedAt;
    if (backgroundedAt == null) return;
    final elapsed =
        _lock.state.delay == AppLockDelay.immediately ||
        _now().difference(backgroundedAt) >= _lock.state.delay.duration;
    if (elapsed || clearWhenEarly) _backgroundedAt = null;
    if (elapsed) _lock.lock();
  }

  void _enqueue(Object owner, VoidCallback work) {
    if (_disposed) return;
    _featureWork[owner] = work;
    scheduleRefresh();
  }

  void accountOrLockChanged() {
    _syncRecentsPrivacy();
    scheduleRefresh();
  }

  /// Keeps the app-switcher preview private only while a signed-in account
  /// has App Lock on. A failed update is retried on the next lock or account
  /// change.
  void _syncRecentsPrivacy() {
    if (_snapshotPlatform == null || _disposed) return;
    final lock = _lock.state;
    final hidden = _accountIdentity() != null && lock.hasLoaded && lock.enabled;
    if (_recentsHidden == hidden) return;
    _recentsHidden = hidden;
    unawaited(
      _snapshot.invokeMethod<void>('setRecentsPrivacy', hidden).catchError((
        Object error,
      ) {
        if (_recentsHidden == hidden) _recentsHidden = null;
        debugPrint('App Lock recents privacy bridge failed: $error');
      }),
    );
  }

  void scheduleRefresh() {
    if (_disposed ||
        _frameScheduled ||
        (!_refreshPending && _featureWork.isEmpty)) {
      return;
    }
    _frameScheduled = true;
    final binding = WidgetsBinding.instance;
    binding.addPostFrameCallback((_) {
      _frameScheduled = false;
      if (_disposed || binding.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      final lock = _lock.state;
      if (_accountIdentity() != null &&
          (!lock.hasLoaded ||
              lock.locked ||
              lock.status == AppLockStatus.loading)) {
        return;
      }
      if (_refreshPending) {
        _refreshPending = false;
        _refresh();
      }
      final work = _featureWork.values.toList(growable: false);
      _featureWork.clear();
      for (final refresh in work) {
        refresh();
      }
    });
    binding.ensureVisualUpdate();
  }

  void dispose() {
    _disposed = true;
    _unbindRefresh();
    _featureWork.clear();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription.cancel());
  }
}
