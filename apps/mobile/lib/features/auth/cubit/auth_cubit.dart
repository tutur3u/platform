import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

/// Manages authentication state across the app.
///
/// Ported from apps/native/lib/stores/auth-store.ts (Zustand → Cubit).
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({
    required AuthRepository authRepository,
    Future<void> Function()? onBeforeSignOut,
  }) : _repo = authRepository,
       _onBeforeSignOut = onBeforeSignOut,
       super(_resolveInitialState(authRepository)) {
    unawaited(_hydrateMultiAccountStore());
    _setupAuthListener();
  }

  final AuthRepository _repo;
  final Future<void> Function()? _onBeforeSignOut;
  StreamSubscription<supa.AuthState>? _authSub;

  Future<void> _hydrateMultiAccountStore() async {
    final accounts = await _repo.getStoredAccounts();
    final activeAccountId = await _repo.getActiveStoredAccountId();
    emit(
      state.copyWith(
        accounts: accounts,
        activeAccountId: activeAccountId,
      ),
    );

    if (state.status == AuthStatus.authenticated) {
      await _repo.syncCurrentSessionToMultiAccountStore();
      await _reloadStoredAccounts();
    }
  }

  Future<void> _reloadStoredAccounts() async {
    final accounts = await _repo.getStoredAccounts();
    final activeAccountId = await _repo.getActiveStoredAccountId();
    emit(
      state.copyWith(
        accounts: accounts,
        activeAccountId: activeAccountId,
      ),
    );
  }

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
          unawaited(
            _repo.syncCurrentSessionToMultiAccountStore().then(
              (_) => _reloadStoredAccounts(),
            ),
          );
        } else if (event == supa.AuthChangeEvent.signedOut) {
          if (state.isAddAccountFlow) {
            emit(
              const AuthState.unauthenticated().copyWith(
                accounts: state.accounts,
                activeAccountId: state.activeAccountId,
                isAddAccountFlow: true,
              ),
            );
            unawaited(_reloadStoredAccounts());
          } else {
            emit(
              const AuthState.unauthenticated().copyWith(
                accounts: const <StoredAuthAccount>[],
                activeAccountId: null,
              ),
            );
          }
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
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
            isAddAccountFlow: state.isAddAccountFlow,
          ),
        );
      },
    );
  }

  // ── OTP ─────────────────────────────────────────

  Future<({bool success, int? retryAfter})> sendOtp(
    String email, {
    String? captchaToken,
  }) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.sendOtp(email, captchaToken: captchaToken);
    emit(
      state.copyWith(
        isLoading: false,
        error: result.error,
        errorCode: null,
      ),
    );
    return (success: result.success, retryAfter: result.retryAfter);
  }

  Future<bool> verifyOtp(String email, String otp) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.verifyOtp(email, otp);
    if (result.success) {
      if (state.isAddAccountFlow) {
        final addResult = await _repo.completeAddAccountFlow();
        if (!addResult.success) {
          emit(
            state.copyWith(
              isLoading: false,
              error: addResult.error,
              errorCode: null,
            ),
          );
          return false;
        }
      }

      final user = await _repo.getCurrentUser();
      if (user != null) {
        if (_repo.checkMfaRequired()) {
          emit(AuthState.mfaRequired(user));
        } else {
          emit(AuthState.authenticated(user));
        }
        await _reloadStoredAccounts();
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
      if (state.isAddAccountFlow) {
        final addResult = await _repo.completeAddAccountFlow();
        if (!addResult.success) {
          emit(
            state.copyWith(
              isLoading: false,
              error: addResult.error,
              errorCode: null,
            ),
          );
          return false;
        }
      }

      final user = await _repo.getCurrentUser();
      if (user != null) {
        if (_repo.checkMfaRequired()) {
          emit(AuthState.mfaRequired(user));
        } else {
          emit(AuthState.authenticated(user));
        }
        await _reloadStoredAccounts();
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
    await _signInWithExternalProvider(
      action: _repo.signInWithGoogle,
      fallbackErrorCode: AuthErrorCode.googleSignInFailed,
    );
  }

  Future<void> signInWithMicrosoft() async {
    await _signInWithExternalProvider(
      action: _repo.signInWithMicrosoft,
      fallbackErrorCode: AuthErrorCode.microsoftBrowserLaunchFailed,
    );
  }

  Future<void> signInWithApple() async {
    await _signInWithExternalProvider(
      action: _repo.signInWithApple,
      fallbackErrorCode: AuthErrorCode.appleSignInFailed,
    );
  }

  Future<void> signInWithGithub() async {
    await _signInWithExternalProvider(
      action: _repo.signInWithGithub,
      fallbackErrorCode: AuthErrorCode.githubBrowserLaunchFailed,
    );
  }

  Future<void> _signInWithExternalProvider({
    required Future<AuthActionResult> Function() action,
    required AuthErrorCode fallbackErrorCode,
  }) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await action();
    await _handleAuthActionResult(
      result,
      fallbackErrorCode: fallbackErrorCode,
    );
  }

  Future<void> _handleAuthActionResult(
    AuthActionResult result, {
    required AuthErrorCode fallbackErrorCode,
  }) async {
    switch (result.status) {
      case AuthActionStatus.success:
        if (state.isAddAccountFlow) {
          final addResult = await _repo.completeAddAccountFlow();
          if (!addResult.success) {
            emit(
              state.copyWith(
                isLoading: false,
                error: addResult.error,
                errorCode: fallbackErrorCode,
              ),
            );
            return;
          }
        }

        final user = await _repo.getCurrentUser();
        if (user != null) {
          if (_repo.checkMfaRequired()) {
            emit(AuthState.mfaRequired(user));
          } else {
            emit(AuthState.authenticated(user));
          }
          await _reloadStoredAccounts();
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
            error: result.errorMessage,
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
    await CacheStore.instance.clearScope(userId: state.user?.id);
    await _onBeforeSignOut?.call();
    await _repo.signOut();
    emit(
      const AuthState.unauthenticated().copyWith(
        accounts: const <StoredAuthAccount>[],
        activeAccountId: null,
      ),
    );
  }

  Future<bool> beginAddAccountFlow() async {
    final fallbackActiveAccountId = state.activeAccountId ?? state.user?.id;
    emit(
      state.copyWith(
        isLoading: true,
        isAddAccountFlow: true,
        activeAccountId: fallbackActiveAccountId,
        error: null,
        errorCode: null,
      ),
    );

    try {
      await _repo.syncCurrentSessionToMultiAccountStore();
      await _reloadStoredAccounts();
      await _repo.signOutLocalSessionOnly();
      emit(
        state.copyWith(
          isLoading: false,
          status: AuthStatus.unauthenticated,
          error: null,
          errorCode: null,
        ),
      );
      return true;
    } on Exception catch (e) {
      emit(
        state.copyWith(
          isLoading: false,
          error: e.toString(),
          errorCode: null,
        ),
      );
      return false;
    }
  }

  void setAddAccountFlow({required bool enabled}) {
    emit(state.copyWith(isAddAccountFlow: enabled));
  }

  /// Restores the previous on-device session after [beginAddAccountFlow] and
  /// clears the add-account flag. Used when the user dismisses the add-account
  /// screen (system back or explicit "Home" control).
  Future<bool> cancelAddAccountFlow() async {
    final shouldAttemptRestore =
        state.isAddAccountFlow || state.status == AuthStatus.unauthenticated;
    if (!shouldAttemptRestore) {
      return true;
    }

    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    try {
      var accountId = await _repo.getActiveStoredAccountId();
      if (accountId == null) {
        final accounts = await _repo.getStoredAccounts();
        accountId = accounts.isNotEmpty ? accounts.first.id : null;
      }
      if (accountId == null) {
        emit(state.copyWith(isLoading: false, isAddAccountFlow: false));
        return false;
      }

      final result = await _repo.switchToStoredAccount(accountId);
      if (!result.success) {
        emit(
          state.copyWith(
            isLoading: false,
            error: result.error,
            errorCode: null,
            isAddAccountFlow: false,
          ),
        );
        return false;
      }

      final user = await _repo.getCurrentUser();
      if (user == null) {
        emit(state.copyWith(isLoading: false, isAddAccountFlow: false));
        return false;
      }

      if (_repo.checkMfaRequired()) {
        emit(
          AuthState.mfaRequired(user).copyWith(
            isLoading: false,
            isAddAccountFlow: false,
          ),
        );
      } else {
        emit(
          AuthState.authenticated(user).copyWith(
            isLoading: false,
            isAddAccountFlow: false,
          ),
        );
      }
      await _reloadStoredAccounts();
      return true;
    } on Exception catch (e) {
      emit(
        state.copyWith(
          isLoading: false,
          error: e.toString(),
          errorCode: null,
          isAddAccountFlow: false,
        ),
      );
      return false;
    }
  }

  Future<void> syncCurrentSessionToStore() async {
    await _repo.syncCurrentSessionToMultiAccountStore();
    await _reloadStoredAccounts();
  }

  Future<bool> switchAccount(String accountId) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    final result = await _repo.switchToStoredAccount(accountId);
    if (!result.success) {
      emit(
        state.copyWith(
          isLoading: false,
          error: result.error,
          errorCode: null,
        ),
      );
      return false;
    }

    if (previousUserId != null && previousUserId != accountId) {
      await CacheStore.instance.clearScope(userId: previousUserId);
    }

    await _reloadStoredAccounts();
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> removeAccount(String accountId) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    final result = await _repo.removeStoredAccount(accountId);
    if (!result.success) {
      emit(
        state.copyWith(
          isLoading: false,
          error: result.error,
          errorCode: null,
        ),
      );
      return false;
    }

    if (previousUserId == accountId) {
      await CacheStore.instance.clearScope(userId: accountId);
    }

    await _reloadStoredAccounts();
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> signOutCurrentAccount() async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    final result = await _repo.signOutCurrentAccount();
    if (result.error != null) {
      emit(
        state.copyWith(
          isLoading: false,
          error: result.error,
          errorCode: null,
        ),
      );
      return false;
    }

    if (previousUserId != null) {
      await CacheStore.instance.clearScope(userId: previousUserId);
    }

    await _reloadStoredAccounts();
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<void> signOutAllAccounts() async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    await CacheStore.instance.clearScope(userId: state.user?.id);
    await _onBeforeSignOut?.call();
    await _repo.signOutAllAccounts();
    emit(
      const AuthState.unauthenticated().copyWith(
        accounts: const <StoredAuthAccount>[],
        activeAccountId: null,
      ),
    );
  }

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) async {
    await _repo.updateActiveAccountWorkspaceContext(workspaceId);
    await _reloadStoredAccounts();
  }

  void clearError() => emit(state.copyWith(error: null, errorCode: null));

  @override
  Future<void> close() async {
    await _authSub?.cancel();
    _repo.dispose();
    return super.close();
  }
}
