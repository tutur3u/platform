import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_feature_cache.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

part 'auth_signed_out.dart';

/// Manages authentication state across the app.
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({
    required AuthRepository authRepository,
    Future<void> Function()? onBeforeSignOut,
    Future<void> Function()? onAbortedSwitch,
  }) : _repo = authRepository,
       _onBeforeSignOut = onBeforeSignOut,
       _onAbortedSwitch = onAbortedSwitch,
       super(_resolveInitialState(authRepository)) {
    unawaited(_hydrateMultiAccountStore());
    _setupAuthListener();
    unawaited(refreshAccountAssurance());
  }

  final AuthRepository _repo;
  final Future<void> Function()? _onBeforeSignOut;
  StreamSubscription<supa.AuthState>? _authSub;

  // Keep account switching stable across asynchronous provider auth events.
  bool _isInAddAccountFlow = false;
  bool _awaitingAddAccountRedirect = false;

  final Future<void> Function()? _onAbortedSwitch;
  int _accountsRead = 0;

  Future<void> _hydrateMultiAccountStore() async {
    await _reloadStoredAccounts();
    if (isClosed || state.status != AuthStatus.authenticated) return;
    await syncCurrentSessionToStore();
  }

  Future<void> _reloadStoredAccounts() async {
    final read = ++_accountsRead;
    final accounts = await _repo.getStoredAccounts();
    final storedActiveId = state.user == null
        ? await _repo.getActiveStoredAccountId()
        : null;
    if (isClosed || read != _accountsRead) return;
    final actor = state.user?.id;
    final hasActiveAccount =
        state.activeAccountId == actor ||
        accounts.any((account) => account.id == actor);
    emit(
      state.copyWith(
        accounts: accounts,
        activeAccountId: actor == null
            ? storedActiveId
            : hasActiveAccount
            ? actor
            : null,
        expiredAccountIds: state.expiredAccountIds.intersection(
          accounts.map((account) => account.id).toSet(),
        ),
      ),
    );
  }

  /// Resolve cached assurance immediately, then revalidate in the background.
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
                event == supa.AuthChangeEvent.tokenRefreshed ||
                event == supa.AuthChangeEvent.mfaChallengeVerified) &&
            session?.user != null) {
          final finishAdd =
              _awaitingAddAccountRedirect &&
              event == supa.AuthChangeEvent.signedIn;
          _publishAuthenticatedUser(session!.user, finishAdd: finishAdd);
          unawaited(syncCurrentSessionToStore());
        } else if (event == supa.AuthChangeEvent.signedOut) {
          _publishSignedOutState(emit);
        }
      },
      onError: (Object error, StackTrace stackTrace) {
        // GoTrue keeps the local session and retries refresh after a transport
        // failure. A stream error is not a sign-out event: routing to Login
        // here strands the user until the app is restarted.
        final currentUser = _repo.getCurrentUserSync();
        if (currentUser != null &&
            state.user?.id == currentUser.id &&
            (state.status == AuthStatus.authenticated ||
                state.status == AuthStatus.mfaRequired)) {
          if (state.isLoading) emit(state.copyWith(isLoading: false));
          return;
        }
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
            addAccountEmail: state.addAccountEmail,
          ),
        );
      },
    );
  }

  void _publishAuthenticatedUser(supa.User user, {bool finishAdd = false}) {
    if (finishAdd) {
      _isInAddAccountFlow = false;
      _awaitingAddAccountRedirect = false;
    }
    emit(
      (_repo.checkMfaRequired()
              ? AuthState.mfaRequired(user)
              : AuthState.authenticated(user))
          .copyWith(
            isAddAccountFlow:
                !finishAdd && (state.isAddAccountFlow || _isInAddAccountFlow),
            addAccountEmail: finishAdd ? null : state.addAccountEmail,
            accounts: state.accounts,
            activeAccountId: user.id,
            switchingAccountId: state.switchingAccountId,
            expiredAccountIds: state.expiredAccountIds.difference({user.id}),
          ),
    );
  }

  void _finishSignIn(supa.User user) {
    if (state.isAddAccountFlow || _isInAddAccountFlow) {
      _publishAuthenticatedUser(user, finishAdd: true);
    } else {
      emit(
        _repo.checkMfaRequired()
            ? AuthState.mfaRequired(user)
            : AuthState.authenticated(user),
      );
    }
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
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
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
        _finishSignIn(user);
        await _reloadStoredAccounts();
        return true;
      }
    }
    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
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
        _finishSignIn(user);
        await _reloadStoredAccounts();
        return true;
      }
    }
    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
    );
    return false;
  }

  Future<void> signInWithGoogle() async {
    await _signInWithExternalProvider(
      action: _repo.signInWithGoogle,
      fallbackErrorCode: AuthErrorCode.googleSignInFailed,
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

  Future<bool> signInWithQrLoginSession(AuthSessionPayload session) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.signInWithSession(session);
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
        _finishSignIn(user);
        await _reloadStoredAccounts();
        return true;
      }
    }

    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
    );
    return false;
  }

  Future<void> _signInWithExternalProvider({
    required Future<AuthActionResult> Function() action,
    required AuthErrorCode fallbackErrorCode,
  }) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await action();
    if (isClosed) return;
    await _handleAuthActionResult(result, fallbackErrorCode: fallbackErrorCode);
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
          _finishSignIn(user);
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
        _awaitingAddAccountRedirect = state.isAddAccountFlow;
        emit(state.copyWith(isLoading: false, error: null, errorCode: null));
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
        await _repo.syncCurrentSessionToMultiAccountStore();
        if (isClosed) return false;
        await _reloadStoredAccounts();
        if (isClosed) return false;
        emit(
          AuthState.authenticated(user).copyWith(
            accounts: state.accounts,
            activeAccountId: state.activeAccountId,
          ),
        );
        return true;
      }
    }
    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
    );
    return false;
  }

  Future<bool> signUp(String email, String password) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.signUp(email, password);
    if (isClosed) return result.success;
    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
    );
    return result.success;
  }

  // ── Password reset ──────────────────────────────

  Future<bool> resetPassword(String email) async {
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final result = await _repo.resetPassword(email);
    if (isClosed) return result.success;
    emit(
      state.copyWith(isLoading: false, error: result.error, errorCode: null),
    );
    return result.success;
  }

  // ── Session management ──────────────────────────

  Future<void> signOut() async {
    if (state.switchingAccountId != null) return;
    _isInAddAccountFlow = false;
    _awaitingAddAccountRedirect = false;
    emit(state.copyWith(isLoading: true));
    await CacheStore.instance.clearResources(userId: state.user?.id);
    await clearSignedOutAccountCaches(state.user?.id, allAccounts: true);
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

  Future<bool> beginAddAccountFlow({String? email}) async {
    if (state.switchingAccountId != null) return false;
    _isInAddAccountFlow = true;
    _awaitingAddAccountRedirect = false;
    final fallbackActiveAccountId = state.user?.id ?? state.activeAccountId;
    emit(
      state.copyWith(
        isLoading: true,
        isAddAccountFlow: true,
        activeAccountId: fallbackActiveAccountId,
        addAccountEmail: email,
        error: null,
        errorCode: null,
      ),
    );

    try {
      if (state.user != null) {
        final saved = await _repo.completeAddAccountFlow();
        if (!saved.success) throw StateError('Failed to save account');
      }
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
    } on Object {
      if (isClosed) return false;
      _isInAddAccountFlow = false;
      emit(
        state.copyWith(
          isLoading: false,
          isAddAccountFlow: false,
          error: null,
          errorCode: null,
          addAccountEmail: null,
        ),
      );
      return false;
    }
  }

  void setAddAccountFlow({required bool enabled}) {
    if (!enabled) _awaitingAddAccountRedirect = false;
    _isInAddAccountFlow = enabled;
    emit(
      state.copyWith(
        isAddAccountFlow: enabled,
        addAccountEmail: enabled ? state.addAccountEmail : null,
      ),
    );
  }

  /// Leaves add-account mode and, when necessary, switches back to a stored
  /// account before clearing the flag.
  Future<bool> cancelAddAccountFlow() async {
    _awaitingAddAccountRedirect = false;
    if (state.status == AuthStatus.authenticated && state.isAddAccountFlow) {
      _isInAddAccountFlow = false;
      emit(
        state.copyWith(
          isLoading: false,
          isAddAccountFlow: false,
          addAccountEmail: null,
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
        emit(state.copyWith(isLoading: false, isAddAccountFlow: false));
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
          AuthState.mfaRequired(
            user,
          ).copyWith(isLoading: false, isAddAccountFlow: false),
        );
      } else {
        emit(
          AuthState.authenticated(
            user,
          ).copyWith(isLoading: false, isAddAccountFlow: false),
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
    try {
      await _repo.syncCurrentSessionToMultiAccountStore();
      if (!isClosed) await _reloadStoredAccounts();
    } on Object {
      // The in-memory account list remains usable if refresh fails.
    }
  }

  Future<bool> switchAccount(String accountId) async {
    if (state.switchingAccountId != null || state.isLoading) return false;
    final departing = state.user?.id;
    if (departing == accountId) return true;
    emit(
      state.copyWith(
        switchingAccountId: accountId,
        error: null,
        errorCode: null,
      ),
    );

    var didStopServices = false;
    final result = await _repo.switchToStoredAccount(
      accountId,
      beforeActivate: () async {
        if (isClosed || state.user?.id != departing) {
          throw StateError('Account changed during switch');
        }
        didStopServices = _onBeforeSignOut != null;
        await Future.wait([
          if (departing != null) ...[
            clearAuthFeatureCaches(userId: departing),
            CacheStore.instance.clearResources(userId: departing),
          ],
          if (_onBeforeSignOut case final stop?) stop(),
        ]);
        if (isClosed) throw StateError('Account switch was closed');
      },
    );
    if (isClosed) return false;

    final user = _repo.getCurrentUserSync();
    final succeeded = result.success && user?.id == accountId;
    if (succeeded) {
      _publishAuthenticatedUser(user!);
      unawaited(syncCurrentSessionToStore());
    } else if (didStopServices && user?.id == departing) {
      try {
        await _onAbortedSwitch?.call();
      } on Object {
        // Recovery of side services does not change the auth outcome.
      }
    }
    if (isClosed) return false;
    emit(
      state.copyWith(
        switchingAccountId: null,
        error: result == StoredAccountSwitchResult.failed ? result.error : null,
        expiredAccountIds: result == StoredAccountSwitchResult.signInRequired
            ? {...state.expiredAccountIds, accountId}
            : state.expiredAccountIds,
      ),
    );
    return succeeded;
  }

  Future<bool> removeAccount(String accountId) async {
    if (state.switchingAccountId != null) return false;
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    final removingActiveAccount = previousUserId == accountId;
    if (removingActiveAccount) {
      await clearAuthFeatureCaches(userId: previousUserId);
      await _onBeforeSignOut?.call();
    }
    if (isClosed) return false;
    final result = await _repo.removeStoredAccount(accountId);
    if (isClosed) return false;
    if (!result.success) {
      emit(
        state.copyWith(isLoading: false, error: result.error, errorCode: null),
      );
      return false;
    }

    await clearRemovedAccountData(accountId);

    final newUser = await _repo.getCurrentUser();
    if (isClosed) return false;
    if (newUser != null) _publishAuthenticatedUser(newUser);

    await _reloadStoredAccounts();
    if (isClosed) return false;
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> signOutCurrentAccount() async {
    if (state.switchingAccountId != null) return false;
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    final previousUserId = state.user?.id;
    await clearSignedOutAccountCaches(previousUserId);
    await _onBeforeSignOut?.call();
    if (isClosed) return false;
    final result = await _repo.signOutCurrentAccount();
    if (isClosed) return false;
    if (result.error != null) {
      emit(
        state.copyWith(isLoading: false, error: result.error, errorCode: null),
      );
      return false;
    }

    if (previousUserId != null) {
      await CacheStore.instance.clearResources(userId: previousUserId);
    }

    final newUser = await _repo.getCurrentUser();
    if (isClosed) return false;
    if (newUser != null) {
      _publishAuthenticatedUser(newUser);
    } else {
      emit(const AuthState.unauthenticated());
    }

    await _reloadStoredAccounts();
    if (isClosed) return false;
    emit(state.copyWith(isLoading: false, error: null, errorCode: null));
    return true;
  }

  Future<bool> signOutAllAccounts() async {
    if (state.switchingAccountId != null) return false;
    _isInAddAccountFlow = false;
    _awaitingAddAccountRedirect = false;
    emit(state.copyWith(isLoading: true, error: null, errorCode: null));
    await CacheStore.instance.clearScope(userId: state.user?.id);
    await clearSignedOutAccountCaches(state.user?.id, allAccounts: true);
    await _onBeforeSignOut?.call();
    if (isClosed) return false;
    final result = await _repo.signOutAllAccounts();
    if (isClosed) return false;
    if (!result.success) {
      emit(
        state.copyWith(
          isLoading: false,
          error: result.error ?? 'Failed to sign out',
          errorCode: null,
        ),
      );
      return false;
    }
    emit(
      const AuthState.unauthenticated().copyWith(
        accounts: const <StoredAuthAccount>[],
        activeAccountId: null,
      ),
    );
    return true;
  }

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) async {
    await _repo.updateActiveAccountWorkspaceContext(workspaceId);
    if (isClosed) return;
    await _reloadStoredAccounts();
  }

  /// Optional accounts keep cached/offline access; fresh policy routes on reconnect.
  Future<void> refreshAccountAssurance() async {
    if (state.user == null || isClosed) return;
    if (_repo.checkMfaRequired()) {
      emit(state.copyWith(status: AuthStatus.mfaRequired));
    }
    try {
      await _repo.refreshSession();
      if (isClosed) return;
      final user = _repo.getCurrentUserSync();
      if (user == null) return;
      emit(
        state.copyWith(
          user: user,
          status: _repo.checkMfaRequired()
              ? AuthStatus.mfaRequired
              : AuthStatus.authenticated,
        ),
      );
    } on Object {
      // Offline retains the last known policy until reconnect.
    }
  }

  void clearError() => emit(state.copyWith(error: null, errorCode: null));

  @override
  Future<void> close() async {
    await _authSub?.cancel();
    _repo.dispose();
    return await super.close();
  }
}
