import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';

class AppLockLifecycle with WidgetsBindingObserver {
  AppLockLifecycle({
    required AppLockCubit lock,
    required bool Function() hasAccount,
    required ValueChanged<AppLifecycleState> onSuspend,
    required VoidCallback refresh,
    DateTime Function()? now,
  }) : _lock = lock,
       _hasAccount = hasAccount,
       _onSuspend = onSuspend,
       _refresh = refresh,
       _now = now ?? DateTime.now {
    _subscription = _lock.stream.listen((_) => scheduleRefresh());
    WidgetsBinding.instance.addObserver(this);
  }

  static const _snapshot = MethodChannel('mobile/app_snapshot_privacy');

  final AppLockCubit _lock;
  final bool Function() _hasAccount;
  final ValueChanged<AppLifecycleState> _onSuspend;
  final VoidCallback _refresh;
  final DateTime Function() _now;
  late final StreamSubscription<AppLockState> _subscription;
  DateTime? _backgroundedAt;
  bool _frameScheduled = false;
  bool _refreshPending = false;
  bool _coverReleasePending = false;
  bool _disposed = false;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      if (state == AppLifecycleState.paused ||
          state == AppLifecycleState.hidden ||
          (state == AppLifecycleState.inactive &&
              _lock.state.delay != AppLockDelay.immediately)) {
        _backgroundedAt ??= _now();
      }
      _onSuspend(state);
      return;
    }

    final backgroundedAt = _backgroundedAt;
    _backgroundedAt = null;
    if (backgroundedAt != null &&
        (_lock.state.delay == AppLockDelay.immediately ||
            _now().difference(backgroundedAt) >= _lock.state.delay.duration)) {
      _lock.lock();
    }
    _refreshPending = true;
    _coverReleasePending = true;
    scheduleRefresh();
  }

  void scheduleRefresh() {
    if (_disposed || _frameScheduled || !_refreshPending) return;
    _frameScheduled = true;
    final binding = WidgetsBinding.instance;
    binding.addPostFrameCallback((_) {
      _frameScheduled = false;
      if (_disposed || binding.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      if (_coverReleasePending) {
        _coverReleasePending = false;
        unawaited(_revealNativeWindow());
      }
      final lock = _lock.state;
      if (_hasAccount() &&
          (!lock.hasLoaded ||
              lock.locked ||
              lock.status == AppLockStatus.loading)) {
        return;
      }
      _refreshPending = false;
      _refresh();
    });
    binding.ensureVisualUpdate();
  }

  Future<void> _revealNativeWindow() async {
    try {
      await _snapshot.invokeMethod<void>('foregroundFrameReady');
    } on MissingPluginException {
      // Platforms without a native cover still use the Flutter boundary.
    }
  }

  void dispose() {
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription.cancel());
  }
}
