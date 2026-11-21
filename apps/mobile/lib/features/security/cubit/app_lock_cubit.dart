import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';

enum AppLockStatus { idle, loading, authenticating, unavailable }

/// [AppLockState.error] when authentication succeeded but the setting could
/// not be stored.
const appLockSaveFailedError = 'App Lock setting could not be saved';

class AppLockState extends Equatable {
  const AppLockState({
    this.enabled = false,
    this.locked = false,
    this.hasLoaded = false,
    this.delay = AppLockDelay.after30Seconds,
    this.status = AppLockStatus.idle,
    this.error,
  });

  final bool enabled;
  final bool locked;
  final bool hasLoaded;
  final AppLockDelay delay;
  final AppLockStatus status;
  final String? error;

  AppLockState copyWith({
    bool? enabled,
    bool? locked,
    bool? hasLoaded,
    AppLockDelay? delay,
    AppLockStatus? status,
    String? error,
  }) {
    return AppLockState(
      enabled: enabled ?? this.enabled,
      locked: locked ?? this.locked,
      hasLoaded: hasLoaded ?? this.hasLoaded,
      delay: delay ?? this.delay,
      status: status ?? this.status,
      error: error,
    );
  }

  @override
  List<Object?> get props => [enabled, locked, hasLoaded, delay, status, error];
}

class AppLockCubit extends Cubit<AppLockState> {
  AppLockCubit({
    required LocalAuthService localAuthService,
    required AppLockSettingsStore settingsStore,
  }) : _localAuthService = localAuthService,
       _settingsStore = settingsStore,
       super(const AppLockState());

  static const _settingsTimeout = Duration(seconds: 3);

  final LocalAuthService _localAuthService;
  final AppLockSettingsStore _settingsStore;

  int _generation = 0;
  int _lifetime = 0;
  int _delayIntent = 0;
  int _pendingDelayWrites = 0;
  bool _authenticationInFlight = false;
  Future<void> _delayWrites = Future<void>.value();

  bool _currentLifetime(int lifetime) => !isClosed && lifetime == _lifetime;

  Future<bool> _authenticate(String reason, int generation) async {
    final lifetime = _lifetime;
    _authenticationInFlight = true;
    try {
      return await _localAuthService.authenticate(reason: reason);
    } on Object {
      if (_current(generation)) {
        emit(state.copyWith(status: AppLockStatus.idle));
      }
      rethrow;
    } finally {
      _authenticationInFlight = false;
      if (_currentLifetime(lifetime) &&
          !_current(generation) &&
          state.locked &&
          state.status == AppLockStatus.authenticating) {
        emit(state.copyWith(status: AppLockStatus.idle));
      }
    }
  }

  bool _current(int generation) => !isClosed && generation == _generation;

  Future<void> load({bool lockIfEnabled = false}) async {
    if (isClosed) return;
    final generation = ++_generation;
    // An account change keeps the device-wide setting it already knows, so
    // lock before the read rather than leaving the navigator usable during it.
    final lockNow =
        state.hasLoaded && (state.locked || (lockIfEnabled && state.enabled));
    emit(state.copyWith(locked: lockNow, status: AppLockStatus.loading));
    bool enabled;
    try {
      enabled = await _settingsStore.isEnabled().timeout(_settingsTimeout);
    } on Object catch (error) {
      // An unreadable setting must not leave the app on the loading splash.
      // The last known choice stands. With none, a device that can
      // authenticate fails closed to the lock screen; App Lock cannot have
      // been turned on without local authentication.
      debugPrint('App Lock settings read failed: $error');
      enabled = state.hasLoaded
          ? state.enabled
          : await _localAuthService.isDeviceSupported().then<bool>(
              (supported) => supported,
              onError: (Object _) => false,
            );
    }
    if (!_current(generation)) return;
    AppLockDelay delay;
    try {
      delay = await _settingsStore.readDelay().timeout(_settingsTimeout);
    } on Object catch (error) {
      debugPrint('App Lock delay read failed: $error');
      delay = state.delay;
    }
    if (!_current(generation)) return;
    emit(
      AppLockState(
        enabled: enabled,
        locked: enabled && (lockIfEnabled || lockNow),
        hasLoaded: true,
        delay: delay,
      ),
    );
  }

  Future<void> setEnabled({
    required bool enabled,
    required String reason,
  }) async {
    if (isClosed ||
        _authenticationInFlight ||
        state.status == AppLockStatus.authenticating) {
      return;
    }
    if (state.hasLoaded && enabled == state.enabled) {
      return;
    }

    final generation = ++_generation;
    if (enabled || state.enabled) {
      emit(state.copyWith(status: AppLockStatus.authenticating));
      final authenticated = await _authenticate(reason, generation);
      if (!_current(generation)) return;
      if (!authenticated) {
        emit(
          state.copyWith(
            status: AppLockStatus.unavailable,
            error: 'Local authentication failed',
          ),
        );
        return;
      }
    }

    try {
      await _settingsStore.setEnabled(enabled: enabled);
    } on Object {
      if (_current(generation)) {
        emit(
          state.copyWith(
            status: AppLockStatus.unavailable,
            error: appLockSaveFailedError,
          ),
        );
      }
      return;
    }
    if (!_current(generation)) return;
    emit(AppLockState(enabled: enabled, hasLoaded: true, delay: state.delay));
  }

  Future<void> setDelay(AppLockDelay delay) async {
    if (isClosed || (delay == state.delay && _pendingDelayWrites == 0)) return;
    final lifetime = _lifetime;
    final intent = ++_delayIntent;
    _pendingDelayWrites++;
    final write = _delayWrites.then((_) async {
      if (!_currentLifetime(lifetime)) return;
      await _settingsStore.setDelay(delay);
      if (!_currentLifetime(lifetime) || intent != _delayIntent) return;
      emit(state.copyWith(delay: delay));
    });
    // A failed save is visible to its caller, without poisoning later saves.
    _delayWrites = write.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    try {
      await write;
    } finally {
      _pendingDelayWrites--;
    }
  }

  void lock() {
    if (isClosed || !state.hasLoaded || !state.enabled || state.locked) {
      return;
    }

    ++_generation;
    emit(
      state.copyWith(
        locked: true,
        status: _authenticationInFlight
            ? AppLockStatus.authenticating
            : AppLockStatus.idle,
      ),
    );
  }

  void resetLockState() {
    ++_generation;
    ++_lifetime;
    ++_delayIntent;
    if (isClosed) return;
    if (state == const AppLockState()) {
      return;
    }

    emit(const AppLockState());
  }

  Future<bool> unlock({required String reason}) async {
    if (isClosed ||
        _authenticationInFlight ||
        !state.hasLoaded ||
        state.status == AppLockStatus.authenticating) {
      return false;
    }

    if (!state.enabled) {
      return true;
    }

    final generation = ++_generation;
    emit(state.copyWith(status: AppLockStatus.authenticating));
    final authenticated = await _authenticate(reason, generation);
    if (!_current(generation)) return false;
    emit(
      authenticated
          ? state.copyWith(locked: false, status: AppLockStatus.idle)
          : state.copyWith(
              status: AppLockStatus.idle,
              error: 'Local authentication failed',
            ),
    );
    return authenticated;
  }

  @override
  Future<void> close() {
    ++_generation;
    ++_lifetime;
    ++_delayIntent;
    return super.close();
  }

  Future<bool> authenticateForQrLogin({required String reason}) async {
    if (!state.hasLoaded || !state.enabled) {
      return false;
    }

    return await unlock(reason: reason);
  }
}
