part of 'auth_cubit.dart';

extension _AuthSignedOut on AuthCubit {
  void _publishSignedOutState(void Function(AuthState) publish) {
    unawaited(clearAuthFeatureCaches(userId: state.user?.id));
    final inAddFlow = state.isAddAccountFlow || _isInAddAccountFlow;
    // An account added alongside stays stored, so it keeps its device data.
    if (!inAddFlow) unawaited(clearAccountDeviceData(userId: state.user?.id));
    if (inAddFlow) {
      publish(
        const AuthState.unauthenticated().copyWith(
          accounts: state.accounts,
          activeAccountId: state.activeAccountId,
          isAddAccountFlow: true,
          addAccountEmail: state.addAccountEmail,
        ),
      );
      unawaited(_reloadStoredAccounts());
    } else {
      publish(
        const AuthState.unauthenticated().copyWith(
          accounts: const <StoredAuthAccount>[],
          activeAccountId: null,
        ),
      );
    }
  }
}
