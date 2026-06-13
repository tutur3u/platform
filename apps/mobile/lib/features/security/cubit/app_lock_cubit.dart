import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';

enum AppLockStatus { idle, loading, authenticating, unavailable }

class AppLockState extends Equatable {
  const AppLockState({
    this.enabled = false,
    this.locked = false,
    this.status = AppLockStatus.idle,
    this.error,
  });

  final bool enabled;
  final bool locked;
  final AppLockStatus status;
  final String? error;

  AppLockState copyWith({
    bool? enabled,
    bool? locked,
    AppLockStatus? status,
    String? error,
  }) {
    return AppLockState(
      enabled: enabled ?? this.enabled,
      locked: locked ?? this.locked,
      status: status ?? this.status,
      error: error,
    );
  }

  @override
  List<Object?> get props => [enabled, locked, status, error];
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
    emit(AppLockState(enabled: enabled, locked: enabled && lockIfEnabled));
  }

  Future<void> setEnabled({
    required bool enabled,
    required String reason,
  }) async {
    if (enabled == state.enabled) {
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
    emit(AppLockState(enabled: enabled));
  }

  void lock() {
    if (!state.enabled || state.locked) {
      return;
    }

    emit(state.copyWith(locked: true));
  }

  void resetLockState() {
    if (!state.locked && state.status == AppLockStatus.idle) {
      return;
    }

    emit(state.copyWith(locked: false, status: AppLockStatus.idle));
  }

  Future<bool> unlock({required String reason}) async {
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
    if (!state.enabled) {
      return false;
    }

    return unlock(reason: reason);
  }
}
