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
           (Platform.isAndroid
               ? TargetPlatform.android
               : Platform.isIOS
               ? TargetPlatform.iOS
               : null) {
    _subscription = _lock.stream.listen((_) => accountOrLockChanged());
    _unbindRefresh = ForegroundRefresh.bind(_enqueue);
    _androidPolicy = _currentAndroidPolicy();
    if (_androidPolicy?.required == true) nativePrivacyReady.value = false;
    if (_resumed) _beginSnapshotHandshake();
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
  final nativePrivacyReady = ValueNotifier<bool>(true);
  ({String? account, bool required})? _androidPolicy;
  int _snapshotRevision = 0;
  Timer? _snapshotRetry;
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
      _invalidateSnapshot();
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
    _beginSnapshotHandshake();
    scheduleRefresh();
  }

  void _enqueue(Object owner, VoidCallback work) {
    if (_disposed) return;
    _featureWork[owner] = work;
    scheduleRefresh();
  }

  bool get _resumed =>
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;

  ({String? account, bool required})? _currentAndroidPolicy() {
    if (_snapshotPlatform != TargetPlatform.android) return null;
    final account = _accountIdentity();
    final lock = _lock.state;
    return (
      account: account,
      required: account != null && (!lock.hasLoaded || lock.enabled),
    );
  }

  void accountOrLockChanged() {
    final policy = _currentAndroidPolicy();
    if (_androidPolicy != policy) {
      _androidPolicy = policy;
      nativePrivacyReady.value = policy?.required != true;
      _beginSnapshotHandshake();
    }
    scheduleRefresh();
  }

  void _invalidateSnapshot() {
    _snapshotRevision++;
    _snapshotRetry?.cancel();
    _snapshotRetry = null;
  }

  bool _snapshotIsCurrent(int revision) =>
      !_disposed &&
      _resumed &&
      revision == _snapshotRevision &&
      _currentAndroidPolicy() == _androidPolicy;

  void _beginSnapshotHandshake() {
    _invalidateSnapshot();
    if (_snapshotPlatform != null && _resumed) {
      unawaited(_prepareSnapshot(_snapshotRevision, attempt: 0));
    }
  }

  Future<void> _prepareSnapshot(int revision, {required int attempt}) async {
    final policy = _androidPolicy;
    try {
      final token = policy == null
          ? await _snapshot.invokeMethod<int>('snapshotActivation')
          : await _snapshot.invokeMethod<String>(
              'preparePrivacyFrame',
              policy.required,
            );
      if (!_snapshotIsCurrent(revision)) return;
      if (token == null) {
        _retrySnapshot(revision, attempt);
        return;
      }

      // Android has installed the secure policy. The upcoming frame can
      // render, but a release still requires its own acknowledgment.
      if (policy != null) nativePrivacyReady.value = true;
      WidgetsBinding.instance
        ..addPostFrameCallback((_) {
          if (_snapshotIsCurrent(revision)) {
            unawaited(_submitSafeFrame(token, revision, attempt));
          }
        })
        ..ensureVisualUpdate();
      scheduleRefresh();
    } on PlatformException catch (error) {
      debugPrint('App Lock snapshot preparation failed: ${error.code}');
      _retrySnapshot(revision, attempt);
    } on MissingPluginException {
      _retrySnapshot(revision, attempt);
    }
  }

  Future<void> _submitSafeFrame(Object token, int revision, int attempt) async {
    try {
      final accepted = await _snapshot.invokeMethod<bool>(
        'foregroundFrameReady',
        token,
      );
      if (accepted != true) _retrySnapshot(revision, attempt);
    } on PlatformException catch (error) {
      debugPrint('App Lock snapshot acknowledgment failed: ${error.code}');
      _retrySnapshot(revision, attempt);
    } on MissingPluginException {
      _retrySnapshot(revision, attempt);
    }
  }

  void _retrySnapshot(int revision, int attempt) {
    if (!_snapshotIsCurrent(revision) || attempt >= 2) return;
    _snapshotRetry?.cancel();
    _snapshotRetry = Timer(Duration(milliseconds: 100 << attempt), () {
      _snapshotRetry = null;
      if (_snapshotIsCurrent(revision)) {
        unawaited(_prepareSnapshot(revision, attempt: attempt + 1));
      }
    });
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

  void dispose() {
    _disposed = true;
    _invalidateSnapshot();
    _unbindRefresh();
    _featureWork.clear();
    nativePrivacyReady.dispose();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription.cancel());
  }
}
