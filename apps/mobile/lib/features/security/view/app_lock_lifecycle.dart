import 'dart:async';
import 'dart:io';

import 'package:flutter/scheduler.dart';
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
    int Function()? readFrameNumber,
  }) : _lock = lock,
       _accountIdentity = accountIdentity,
       _onSuspend = onSuspend,
       _refresh = refresh,
       _now = now ?? DateTime.now,
       _readFrameNumber = readFrameNumber ?? _currentFrameNumber,
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
  final int Function() _readFrameNumber;

  static int _currentFrameNumber() =>
      SchedulerBinding.instance.platformDispatcher.frameData.frameNumber;

  late final StreamSubscription<AppLockState> _subscription;
  late final VoidCallback _unbindRefresh;
  final _featureWork = <Object, VoidCallback>{};
  final nativePrivacyReady = ValueNotifier<bool>(true);
  ({String? account, bool required})? _androidPolicy;
  int _snapshotRevision = 0;
  int? _retryFrame;
  TimingsCallback? _rasterCallback;
  Timer? _rasterTimeout;
  bool _loggedSnapshotError = false;
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
    _retryFrame = null;
    _loggedSnapshotError = false;
    _clearRasterWait();
  }

  bool _snapshotIsCurrent(int revision) =>
      !_disposed &&
      _resumed &&
      revision == _snapshotRevision &&
      _currentAndroidPolicy() == _androidPolicy;

  void _beginSnapshotHandshake() {
    _invalidateSnapshot();
    if (_snapshotPlatform != null && _resumed) {
      unawaited(_prepareSnapshot(_snapshotRevision));
    }
  }

  Future<void> _prepareSnapshot(int revision) async {
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
        _retrySnapshot(revision);
        return;
      }

      // Android has installed the secure policy. The upcoming frame can
      // render, but a release still requires its own acknowledgment.
      if (policy != null) nativePrivacyReady.value = true;
      WidgetsBinding.instance
        ..addPostFrameCallback((_) {
          if (!_snapshotIsCurrent(revision)) return;
          if (_snapshotPlatform == TargetPlatform.iOS) {
            _waitForRaster(token, revision);
          } else {
            unawaited(_submitSafeFrame(token, revision));
          }
        })
        ..ensureVisualUpdate();
      scheduleRefresh();
    } on PlatformException catch (error) {
      _logSnapshotError('preparing the frame: ${error.code}');
      _retrySnapshot(revision);
    } on MissingPluginException {
      _retrySnapshot(revision);
    }
  }

  void _waitForRaster(Object token, int revision) {
    final scheduler = SchedulerBinding.instance;
    final frameNumber = _readFrameNumber();
    if (frameNumber < 0) {
      _retrySnapshot(revision);
      return;
    }
    void onTimings(List<FrameTiming> timings) {
      if (!timings.any((timing) => timing.frameNumber == frameNumber)) return;
      _clearRasterWait();
      if (_snapshotIsCurrent(revision)) {
        unawaited(_submitSafeFrame(token, revision));
      }
    }

    _rasterCallback = onTimings;
    scheduler.addTimingsCallback(onTimings);
    // Frame timings arrive in batches in release builds. A dropped frame
    // cannot acknowledge the cover, so submit a new one after the deadline.
    _rasterTimeout = Timer(const Duration(seconds: 2), () {
      _clearRasterWait();
      _retrySnapshot(revision);
    });
  }

  void _clearRasterWait() {
    final callback = _rasterCallback;
    if (callback != null) {
      SchedulerBinding.instance.removeTimingsCallback(callback);
      _rasterCallback = null;
    }
    _rasterTimeout?.cancel();
    _rasterTimeout = null;
  }

  void _logSnapshotError(String reason) {
    if (_loggedSnapshotError) return;
    _loggedSnapshotError = true;
    debugPrint('App Lock snapshot bridge failed while $reason');
  }

  Future<void> _submitSafeFrame(Object token, int revision) async {
    try {
      final accepted = await _snapshot.invokeMethod<bool>(
        'foregroundFrameReady',
        token,
      );
      if (accepted != true) _retrySnapshot(revision);
    } on PlatformException catch (error) {
      _logSnapshotError('acknowledging the frame: ${error.code}');
      _retrySnapshot(revision);
    } on MissingPluginException {
      _retrySnapshot(revision);
    }
  }

  void _retrySnapshot(int revision) {
    if (!_snapshotIsCurrent(revision) || _retryFrame == revision) return;
    _retryFrame = revision;
    SchedulerBinding.instance.scheduleFrameCallback((_) {
      if (!_snapshotIsCurrent(revision)) return;
      _retryFrame = null;
      unawaited(_prepareSnapshot(revision));
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
