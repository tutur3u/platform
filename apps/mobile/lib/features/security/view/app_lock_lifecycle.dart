import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
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
    _subscription = _lock.stream.listen((_) => accountOrLockChanged());
    _unbindRefresh = ForegroundRefresh.bind(_enqueue);
    accountOrLockChanged();
    if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      unawaited(_captureActivation());
    }
    WidgetsBinding.instance.addObserver(this);
  }

  static const _snapshot = MethodChannel('mobile/app_snapshot_privacy');

  final AppLockCubit _lock;
  final bool Function() _hasAccount;
  final ValueChanged<AppLifecycleState> _onSuspend;
  final VoidCallback _refresh;
  final DateTime Function() _now;
  late final StreamSubscription<AppLockState> _subscription;
  late final VoidCallback _unbindRefresh;
  final _featureWork = <Object, VoidCallback>{};
  final nativePrivacyReady = ValueNotifier<bool>(true);
  bool? _androidPrivacyRequired;
  int _androidPrivacyRevision = 0;
  int _activationRevision = 0;
  int? _frameActivation;
  DateTime? _backgroundedAt;
  bool _frameScheduled = false;
  bool _refreshPending = false;
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
      _activationRevision++;
      _frameActivation = null;
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
    unawaited(_captureActivation());
    scheduleRefresh();
  }

  void _enqueue(Object owner, VoidCallback work) {
    if (_disposed) return;
    _featureWork[owner] = work;
    scheduleRefresh();
  }

  void accountOrLockChanged() {
    if (Platform.isAndroid && _lock.state.hasLoaded) {
      final required = _hasAccount() && _lock.state.enabled;
      if (_androidPrivacyRequired != required) {
        _androidPrivacyRequired = required;
        nativePrivacyReady.value = !required;
        unawaited(_applyAndroidPrivacy(required, ++_androidPrivacyRevision));
      }
    }
    scheduleRefresh();
  }

  Future<void> _applyAndroidPrivacy(bool required, int revision) async {
    try {
      await _snapshot.invokeMethod<void>('setSecureSnapshotRequired', required);
      if (!_disposed && revision == _androidPrivacyRevision) {
        nativePrivacyReady.value = true;
        scheduleRefresh();
      }
    } on PlatformException catch (error) {
      debugPrint(
        'App Lock Android privacy could not be applied: ${error.code}',
      );
    } on MissingPluginException {
      debugPrint('App Lock Android privacy bridge unavailable');
    }
  }

  void scheduleRefresh() {
    if (_disposed ||
        _frameScheduled ||
        (!_refreshPending &&
            _frameActivation == null &&
            _featureWork.isEmpty)) {
      return;
    }
    _frameScheduled = true;
    final binding = WidgetsBinding.instance;
    binding.addPostFrameCallback((_) {
      _frameScheduled = false;
      if (_disposed || binding.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      final activation = _frameActivation;
      if (activation != null) {
        _frameActivation = null;
        unawaited(_submitSafeFrame(activation));
      }
      final lock = _lock.state;
      if (_hasAccount() &&
          (!lock.hasLoaded ||
              lock.locked ||
              lock.status == AppLockStatus.loading ||
              !nativePrivacyReady.value)) {
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

  Future<void> _captureActivation() async {
    final revision = _activationRevision;
    try {
      final activation = await _snapshot.invokeMethod<int>(
        'snapshotActivation',
      );
      if (_disposed || revision != _activationRevision || activation == null) {
        return;
      }
      _frameActivation = activation;
      scheduleRefresh();
    } on MissingPluginException {
      // Platforms without a native cover still use the Flutter boundary.
    } on PlatformException catch (error) {
      debugPrint('App Lock snapshot activation failed: ${error.code}');
    }
  }

  Future<void> _submitSafeFrame(int activation) async {
    try {
      await _snapshot.invokeMethod<void>('foregroundFrameReady', activation);
    } on PlatformException catch (error) {
      debugPrint('App Lock snapshot handshake failed: ${error.code}');
    } on MissingPluginException {
      // The native bridge can detach while an activity is recreated.
    }
  }

  void dispose() {
    _disposed = true;
    _unbindRefresh();
    _featureWork.clear();
    nativePrivacyReady.dispose();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription.cancel());
  }
}
