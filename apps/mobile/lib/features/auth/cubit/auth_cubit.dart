import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
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

  // Instance-level guard for the add-account flow.
  //
  // Supabase auth events (signedIn, tokenRefreshed, signedOut) are dispatched
  // asynchronously and can arrive while beginAddAccountFlow() is in progress,
  // potentially resetting isAddAccountFlow to false before the flow completes.
  // This flag lets the listener detect that case and preserve the flag.
  bool _isInAddAccountFlow = false;

  Future<void> _hydrateMultiAccountStore() async {
    final accounts = await _repo.getStoredAccounts();
    final activeAccountId = await _repo.getActiveStoredAccountId();
    if (isClosed) return;
    emit(
      state.copyWith(
        accounts: accounts,
        activeAccountId: activeAccountId,
      ),
    );

    if (state.status == AuthStatus.authenticated) {
      await _repo.syncCurrentSessionToMultiAccountStore();
      if (isClosed) return;
      await _reloadStoredAccounts();
    }
  }

  Future<void> _reloadStoredAccounts() async {
    final accounts = await _repo.getStoredAccounts();
    final activeAccountId = await _repo.getActiveStoredAccountId();
    if (isClosed) return;
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
          // Preserve the add-account flow flag so that an auto-refresh or
          // token rotation mid-flow does not silently clear isAddAccountFlow.
          final keepAddFlow = state.isAddAccountFlow || _isInAddAccountFlow;
          if (_repo.checkMfaRequired()) {
            emit(
              AuthState.mfaRequired(session!.user).copyWith(
                isAddAccountFlow: keepAddFlow,
                accounts: state.accounts,
                activeAccountId: state.activeAccountId,
              ),
            );
          } else {
            emit(
              AuthState.authenticated(session!.user).copyWith(
                isAddAccountFlow: keepAddFlow,
                accounts: state.accounts,
                activeAccountId: state.activeAccountId,
              ),
            );
          }
          unawaited(
            _repo.syncCurrentSessionToMultiAccountStore().then(
              (_) => _reloadStoredAccounts(),
            ),
          );
        } else if (event == supa.AuthChangeEvent.signedOut) {
          final inAddFlow = state.isAddAccountFlow || _isInAddAccountFlow;
          if (inAddFlow) {
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
    if (isClosed) {
      return (success: result.success, retryAfter: result.retryAfter);
    }
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
    if (isClosed) return false;
    if (result.success) {
      if (state.isAddAccountFlow) {
        final addResult = await _repo.completeAddAccountFlow();
        if (isClosed) return false;
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
      if (isClosed) return false;
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
    if (isClosed) return false;
    if (result.success) {
      if (state.isAddAccountFlow) {
        final addResult = await _repo.completeAddAccountFlow();
        if (isClosed) return false;
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
      if (isClosed) return false;
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
    if (isClosed) return;
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
          if (isClosed) return;
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
        if (isClosed) return;
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
    if (isClosed) return false;
    if (result.success) {
      final user = await _repo.getCurrentUser();
      if (isClosed) return false;
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
    if (isClosed) return result.success;
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
    if (isClosed) return result.success;
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
    _isInAddAccountFlow = false;
    emit(state.copyWith(isLoading: true));
    await CacheStore.instance.clearScope(userId: state.user?.id);
    await _clearInMemoryFeatureCaches(userId: state.user?.id);
    await _onBeforeSignOut?.call();
    if (isClosed) return;
    await _repo.signOut();
    if (isClosed) return;
    emit(
      const AuthState.unauthenticated().copyWith(
        accounts: const <StoredAuthAccount>[],
        activeAccountId: null,
      ),
    );
  }

  Future<bool> beginAddAccountFlow() async {
    _isInAddAccountFlow = true;
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
      // Explicitly refresh before syncing so the stored account entry keeps
      // the most recent persisted session for the currently active account.
      try {
        await _repo.refreshSession();
      } on Object {
        // Ignore – we'll sync whatever session is currently available.
      }
      await _repo.syncCurrentSessionToMultiAccountStore();
      if (isClosed) return false;
      await _reloadStoredAccounts();
      if (isClosed) return false;
      emit(
        state.copyWith(
          accounts: state.accounts,
          activeAccountId: state.activeAccountId,
          isAddAccountFlow: true,
          isLoading: false,
          error: null,
          errorCode: null,
        ),
      );
      return true;
    } on Object catch (e) {
      if (isClosed) return false;
      _isInAddAccountFlow = false;
      emit(
        state.copyWith(
          isLoading: false,
          isAddAccountFlow: false,
          error: e.toString(),
          errorCode: null,
        ),
      );
      return false;
    }
  }

  void setAddAccountFlow({required bool enabled}) {
    _isInAddAccountFlow = enabled;
    emit(state.copyWith(isAddAccountFlow: enabled));
  }

  /// Leaves add-account mode and, when necessary, switches back to a stored
  /// account before clearing the flag.
  Future<bool> cancelAddAccountFlow() async {
    if (state.status == AuthStatus.authenticated && state.isAddAccountFlow) {
      _isInAddAccountFlow = false;
      emit(
        state.copyWith(
          isLoading: false,
          isAddAccountFlow: false,
          error: null,
          errorCode: null,
        ),
      );
      return true;
    }

    final shouldAttemptRestore =
        state.isAddAccountFlow ||
        _isInAddAccountFlow ||
        state.status == AuthStatus.unauthenticated;
    if (!shouldAttemptRestore) {
      return true;
    }

    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    try {
      // Try the persistent store first, then fall back to the account ID that
      // was saved into the cubit state at the start of beginAddAccountFlow(),
      // and finally to the first account in the in-memory accounts list.
      var accountId = await _repo.getActiveStoredAccountId();
      accountId ??= state.activeAccountId;
      if (accountId == null) {
        final storeAccounts = await _repo.getStoredAccounts();
        accountId = storeAccounts.isNotEmpty ? storeAccounts.first.id : null;
      }
      accountId ??= state.accounts.isNotEmpty ? state.accounts.first.id : null;

      if (accountId == null) {
        // Truly no account to restore – leave add-account flow entirely.
        _isInAddAccountFlow = false;
        if (isClosed) return false;
        emit(
          state.copyWith(
            isLoading: false,
            isAddAccountFlow: false,
          ),
        );
        return false;
      }

      final result = await _repo.switchToStoredAccount(accountId);
      if (isClosed) return false;
      if (!result.success) {
        // Restore failed (e.g. expired token, network error).  Keep the
        // user on the add-account screen so they can see the error and
        // retry or choose to sign in to a different account.
        emit(
          state.copyWith(
            isLoading: false,
            error: result.error,
            errorCode: null,
            // isAddAccountFlow intentionally NOT cleared here.
          ),
        );
        return false;
      }

      final user = await _repo.getCurrentUser();
      if (isClosed) return false;
      if (user == null) {
        emit(
          state.copyWith(
            isLoading: false,
            error: 'Failed to restore session',
            // isAddAccountFlow intentionally NOT cleared here.
          ),
        );
        return false;
      }

      _isInAddAccountFlow = false;
      if (isClosed) return false;
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
    } on Object catch (e) {
      // Keep user on add-account screen on unexpected errors so they are
      // not silently redirected to /login without a recovery path.
      if (isClosed) return false;
      emit(
        state.copyWith(
          isLoading: false,
          error: e.toString(),
          errorCode: null,
          // isAddAccountFlow intentionally NOT cleared here.
        ),
      );
      return false;
    }
  }

  Future<void> syncCurrentSessionToStore() async {
    await _repo.syncCurrentSessionToMultiAccountStore();
    if (isClosed) return;
    await _reloadStoredAccounts();
  }

  Future<bool> switchAccount(String accountId) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    await _clearInMemoryFeatureCaches(userId: previousUserId);
    await _onBeforeSignOut?.call();
    if (isClosed) return false;
    final result = await _repo.switchToStoredAccount(accountId);
    if (isClosed) return false;
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

    final newUser = await _repo.getCurrentUser();
    if (isClosed) return false;
    if (newUser == null) {
      emit(
        state.copyWith(
          isLoading: false,
          error: 'Failed to restore session',
          errorCode: null,
        ),
      );
      return false;
    }

    if (_repo.checkMfaRequired()) {
      emit(
        AuthState.mfaRequired(newUser).copyWith(
          isLoading: true,
          isAddAccountFlow: state.isAddAccountFlow,
          accounts: state.accounts,
          activeAccountId: state.activeAccountId,
        ),
      );
    } else {
      emit(
        AuthState.authenticated(newUser).copyWith(
          isLoading: true,
          isAddAccountFlow: state.isAddAccountFlow,
          accounts: state.accounts,
          activeAccountId: state.activeAccountId,
        ),
      );
    }

    await _reloadStoredAccounts();
    if (isClosed) return false;
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> removeAccount(String accountId) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    final removingActiveAccount = previousUserId == accountId;
    if (removingActiveAccount) {
      await _clearInMemoryFeatureCaches(userId: previousUserId);
      await _onBeforeSignOut?.call();
    }
    if (isClosed) return false;
    final result = await _repo.removeStoredAccount(accountId);
    if (isClosed) return false;
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

    final newUser = await _repo.getCurrentUser();
    if (isClosed) return false;
    if (newUser != null) {
      if (_repo.checkMfaRequired()) {
        emit(
          AuthState.mfaRequired(newUser).copyWith(
            isLoading: true,
            isAddAccountFlow: state.isAddAccountFlow,
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
          ),
        );
      } else {
        emit(
          AuthState.authenticated(newUser).copyWith(
            isLoading: true,
            isAddAccountFlow: state.isAddAccountFlow,
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
          ),
        );
      }
    }

    await _reloadStoredAccounts();
    if (isClosed) return false;
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> signOutCurrentAccount() async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    await _clearInMemoryFeatureCaches(userId: previousUserId);
    await _onBeforeSignOut?.call();
    if (isClosed) return false;
    final result = await _repo.signOutCurrentAccount();
    if (isClosed) return false;
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

    final newUser = await _repo.getCurrentUser();
    if (isClosed) return false;
    if (newUser != null) {
      if (_repo.checkMfaRequired()) {
        emit(
          AuthState.mfaRequired(newUser).copyWith(
            isLoading: true,
            isAddAccountFlow: state.isAddAccountFlow,
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
          ),
        );
      } else {
        emit(
          AuthState.authenticated(newUser).copyWith(
            isLoading: true,
            isAddAccountFlow: state.isAddAccountFlow,
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
          ),
        );
      }
    } else {
      emit(
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          isAddAccountFlow: state.isAddAccountFlow,
          accounts: state.accounts,
          activeAccountId: state.activeAccountId,
        ),
      );
    }

    await _reloadStoredAccounts();
    if (isClosed) return false;
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<void> signOutAllAccounts() async {
    _isInAddAccountFlow = false;
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    await CacheStore.instance.clearScope(userId: state.user?.id);
    await _clearInMemoryFeatureCaches(userId: state.user?.id);
    await _onBeforeSignOut?.call();
    if (isClosed) return;
    await _repo.signOutAllAccounts();
    if (isClosed) return;
    emit(
      const AuthState.unauthenticated().copyWith(
        accounts: const <StoredAuthAccount>[],
        activeAccountId: null,
      ),
    );
  }

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) async {
    await _repo.updateActiveAccountWorkspaceContext(workspaceId);
    if (isClosed) return;
    await _reloadStoredAccounts();
  }

  Future<void> _clearInMemoryFeatureCaches({String? userId}) async {
    FinanceCubit.clearUserCache(userId);
    if (userId?.isEmpty ?? false) {
      FinanceCubit.clearUserCache(null);
    }
    WalletsPage.clearCache();
    TransactionCategoriesPage.clearCaches();
    HabitsCubit.clearCache();
    CalendarCubit.clearCache();
  }

  void clearError() => emit(state.copyWith(error: null, errorCode: null));

  @override
  Future<void> close() async {
    await _authSub?.cancel();
    _repo.dispose();
    return super.close();
  }
}
