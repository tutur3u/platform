import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

/// Manages authentication state across the app.
///
/// Ported from apps/native/lib/stores/auth-store.ts (Zustand → Cubit).
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({required AuthRepository authRepository})
    : _repo = authRepository,
      super(const AuthState.unknown()) {
    unawaited(_init());
  }

  final AuthRepository _repo;
  StreamSubscription<supa.AuthState>? _authSub;

  Future<void> _init() async {
    final user = await _repo.getCurrentUser();
    if (user != null) {
      emit(AuthState.authenticated(user));
    } else {
      emit(const AuthState.unauthenticated());
    }

    _authSub = _repo.onAuthStateChange().listen((authState) {
      final event = authState.event;
      final session = authState.session;

      if ((event == supa.AuthChangeEvent.signedIn ||
              event == supa.AuthChangeEvent.tokenRefreshed) &&
          session?.user != null) {
        emit(AuthState.authenticated(session!.user));
      } else if (event == supa.AuthChangeEvent.signedOut) {
        emit(const AuthState.unauthenticated());
      }
    });
  }

  // ── OTP ─────────────────────────────────────────

  Future<({bool success, int? retryAfter})> sendOtp(String email) async {
    emit(state.copyWith(isLoading: true));
    final result = await _repo.sendOtp(email);
    emit(state.copyWith(isLoading: false, error: result.error));
    return (success: result.success, retryAfter: result.retryAfter);
  }

  Future<bool> verifyOtp(String email, String otp) async {
    emit(state.copyWith(isLoading: true));
    final result = await _repo.verifyOtp(email, otp);
    if (result.success) {
      final user = await _repo.getCurrentUser();
      if (user != null) {
        emit(AuthState.authenticated(user));
        return true;
      }
    }
    emit(state.copyWith(isLoading: false, error: result.error));
    return result.success;
  }

  // ── Password ────────────────────────────────────

  Future<bool> signInWithPassword(String email, String password) async {
    emit(state.copyWith(isLoading: true));
    final result = await _repo.passwordLogin(email, password);
    if (result.success) {
      final user = await _repo.getCurrentUser();
      if (user != null) {
        emit(AuthState.authenticated(user));
        return true;
      }
    }
    emit(state.copyWith(isLoading: false, error: result.error));
    return result.success;
  }

  Future<bool> signUp(String email, String password) async {
    emit(state.copyWith(isLoading: true));
    final result = await _repo.signUp(email, password);
    emit(state.copyWith(isLoading: false, error: result.error));
    return result.success;
  }

  // ── Password reset ──────────────────────────────

  Future<bool> resetPassword(String email) async {
    emit(state.copyWith(isLoading: true));
    final result = await _repo.resetPassword(email);
    emit(state.copyWith(isLoading: false, error: result.error));
    return result.success;
  }

  // ── Session management ──────────────────────────

  Future<void> signOut() async {
    emit(state.copyWith(isLoading: true));
    await _repo.signOut();
    emit(const AuthState.unauthenticated());
  }

  void clearError() => emit(state.copyWith());

  @override
  Future<void> close() {
    unawaited(_authSub?.cancel());
    _repo.dispose();
    return super.close();
  }
}
