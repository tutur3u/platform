import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

/// Manages authentication state across the app.
///
/// Ported from apps/native/lib/stores/auth-store.ts (Zustand → Cubit).
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({required AuthRepository authRepository})
    : _repo = authRepository,
      super(_resolveInitialState(authRepository)) {
    _setupAuthListener();
  }

  final AuthRepository _repo;
  StreamSubscription<supa.AuthState>? _authSub;

  /// Resolves auth state synchronously from the cached Supabase session.
  ///
  /// `supabase.auth.currentUser` is populated during `Supabase.initialize()`
  /// which completes in `main()` before `runApp()`, so the cached user is
  /// always available by the time this cubit is created.
  static AuthState _resolveInitialState(AuthRepository repo) {
    final user = repo.getCurrentUserSync();
    if (user == null) return const AuthState.unauthenticated();
    if (repo.checkMfaRequired()) return AuthState.mfaRequired(user);
    return AuthState.authenticated(user);
  }

  void _setupAuthListener() {
    _authSub = _repo.onAuthStateChange().listen(
      (authState) {
        final event = authState.event;
        final session = authState.session;

        if ((event == supa.AuthChangeEvent.signedIn ||
                event == supa.AuthChangeEvent.tokenRefreshed) &&
            session?.user != null) {
          if (_repo.checkMfaRequired()) {
            emit(AuthState.mfaRequired(session!.user));
          } else {
            emit(AuthState.authenticated(session!.user));
          }
        } else if (event == supa.AuthChangeEvent.signedOut) {
          emit(const AuthState.unauthenticated());
        }
      },
      onError: (Object error, StackTrace stackTrace) {
        final message = switch (error) {
          final supa.AuthException authError => authError.message,
          _ => error.toString(),
        };

        emit(
          const AuthState.unauthenticated().copyWith(
            error: message,
            errorCode: null,
            isLoading: false,
          ),
        );
      },
    );
  }

  // ── Password ────────────────────────────────────

  Future<bool> signInWithPassword(
    String email,
    String password, {
    String? captchaToken,
  }) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.passwordLogin(
      email,
      password,
      captchaToken: captchaToken,
    );
    if (result.success) {
      final user = await _repo.getCurrentUser();
      if (user != null) {
        if (_repo.checkMfaRequired()) {
          emit(AuthState.mfaRequired(user));
        } else {
          emit(AuthState.authenticated(user));
        }
        return true;
      }
    }
    emit(
      state.copyWith(
        isLoading: false,
        error: result.error,
        errorCode: null,
      ),
    );
    return false;
  }

  Future<void> signInWithGoogle() async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.signInWithGoogle();
    await _handleAuthActionResult(
      result,
      fallbackErrorCode: AuthErrorCode.googleSignInFailed,
    );
  }

  Future<void> signInWithApple() async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.signInWithApple();
    await _handleAuthActionResult(
      result,
      fallbackErrorCode: AuthErrorCode.appleSignInFailed,
    );
  }

  Future<void> _handleAuthActionResult(
    AuthActionResult result, {
    required AuthErrorCode fallbackErrorCode,
  }) async {
    switch (result.status) {
      case AuthActionStatus.success:
        final user = await _repo.getCurrentUser();
        if (user != null) {
          if (_repo.checkMfaRequired()) {
            emit(AuthState.mfaRequired(user));
          } else {
            emit(AuthState.authenticated(user));
          }
          return;
        }
        emit(
          state.copyWith(
            isLoading: false,
            error: null,
            errorCode: fallbackErrorCode,
          ),
        );
      case AuthActionStatus.externalFlowStarted:
      case AuthActionStatus.cancelled:
        emit(state.copyWith(isLoading: false, error: null, errorCode: null));
      case AuthActionStatus.failure:
        emit(
          state.copyWith(
            isLoading: false,
            error: null,
            errorCode: result.errorCode ?? fallbackErrorCode,
          ),
        );
    }
  }

  // ── MFA ────────────────────────────────────────

  Future<bool> verifyMfa(String code) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.verifyMfaCode(code);
    if (result.success) {
      final user = await _repo.getCurrentUser();
      if (user != null) {
        emit(AuthState.authenticated(user));
        return true;
      }
    }
    emit(
      state.copyWith(
        isLoading: false,
        error: result.error,
        errorCode: null,
      ),
    );
    return false;
  }

  Future<bool> signUp(String email, String password) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.signUp(email, password);
    emit(
      state.copyWith(
        isLoading: false,
        error: result.error,
        errorCode: null,
      ),
    );
    return result.success;
  }

  // ── Password reset ──────────────────────────────

  Future<bool> resetPassword(String email) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.resetPassword(email);
    emit(
      state.copyWith(
        isLoading: false,
        error: result.error,
        errorCode: null,
      ),
    );
    return result.success;
  }

  // ── Session management ──────────────────────────

  Future<void> signOut() async {
    emit(state.copyWith(isLoading: true));
    await _repo.signOut();
    emit(const AuthState.unauthenticated());
  }

  void clearError() => emit(state.copyWith(error: null, errorCode: null));

  @override
  Future<void> close() async {
    await _authSub?.cancel();
    _repo.dispose();
    return super.close();
  }
}
