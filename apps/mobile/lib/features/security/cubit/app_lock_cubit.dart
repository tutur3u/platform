import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';

enum AppLockStatus { idle, loading, authenticating, unavailable }

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

  final LocalAuthService _localAuthService;
  final AppLockSettingsStore _settingsStore;

  Future<void> load({bool lockIfEnabled = false}) async {
    emit(state.copyWith(status: AppLockStatus.loading));
    final enabled = await _settingsStore.isEnabled();
    final delay = await _settingsStore.readDelay();
    emit(
      AppLockState(
        enabled: enabled,
        locked: enabled && lockIfEnabled,
        hasLoaded: true,
        delay: delay,
      ),
    );
  }

  Future<void> setEnabled({
    required bool enabled,
    required String reason,
  }) async {
    if (state.hasLoaded && enabled == state.enabled) {
      return;
    }

    if (enabled || state.enabled) {
      emit(state.copyWith(status: AppLockStatus.authenticating));
      final authenticated = await _localAuthService.authenticate(
        reason: reason,
      );
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

    await _settingsStore.setEnabled(enabled: enabled);
    emit(AppLockState(enabled: enabled, hasLoaded: true, delay: state.delay));
  }

  Future<void> setDelay(AppLockDelay delay) async {
    if (delay == state.delay) return;
    await _settingsStore.setDelay(delay);
    emit(state.copyWith(delay: delay));
  }

  void lock() {
    if (!state.hasLoaded || !state.enabled || state.locked) {
      return;
    }

    emit(state.copyWith(locked: true));
  }

  void resetLockState() {
    if (state == const AppLockState()) {
      return;
    }

    emit(const AppLockState());
  }

  Future<bool> unlock({required String reason}) async {
    if (!state.hasLoaded) {
      return false;
    }

    if (!state.enabled) {
      return true;
    }

    emit(state.copyWith(status: AppLockStatus.authenticating));
    final authenticated = await _localAuthService.authenticate(reason: reason);
    emit(
      authenticated
          ? state.copyWith(locked: false, status: AppLockStatus.idle)
          : state.copyWith(status: AppLockStatus.idle),
    );
    return authenticated;
  }

  Future<bool> authenticateForQrLogin({required String reason}) async {
    if (!state.hasLoaded || !state.enabled) {
      return false;
    }

    return await unlock(reason: reason);
  }
}
