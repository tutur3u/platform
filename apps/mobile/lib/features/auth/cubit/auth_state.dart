import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

const _sentinel = Object();

enum AuthStatus {
  /// Initial state while checking persisted session.
  unknown,

  /// User is authenticated and has a valid session.
  authenticated,

  /// User is authenticated but must complete MFA verification.
  mfaRequired,

  /// No valid session.
  unauthenticated,
}

class AuthState extends Equatable {
  const AuthState._({
    this.status = AuthStatus.unknown,
    this.user,
    this.error,
    this.errorCode,
    this.isLoading = false,
    this.accounts = const <StoredAuthAccount>[],
    this.activeAccountId,
    this.isAddAccountFlow = false,
  });

  const AuthState.unknown() : this._();

  const AuthState.authenticated(User user)
    : this._(status: AuthStatus.authenticated, user: user);

  const AuthState.mfaRequired(User user)
    : this._(status: AuthStatus.mfaRequired, user: user);

  const AuthState.unauthenticated({String? error})
    : this._(status: AuthStatus.unauthenticated, error: error);

  final AuthStatus status;
  final User? user;
  final String? error;
  final AuthErrorCode? errorCode;
  final bool isLoading;
  final List<StoredAuthAccount> accounts;
  final String? activeAccountId;
  final bool isAddAccountFlow;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    Object? error = _sentinel,
    Object? errorCode = _sentinel,
    bool? isLoading,
    List<StoredAuthAccount>? accounts,
    Object? activeAccountId = _sentinel,
    bool? isAddAccountFlow,
  }) => AuthState._(
    status: status ?? this.status,
    user: user ?? this.user,
    error: error == _sentinel ? this.error : error as String?,
    errorCode: errorCode == _sentinel
        ? this.errorCode
        : errorCode as AuthErrorCode?,
    isLoading: isLoading ?? this.isLoading,
    accounts: accounts ?? this.accounts,
    activeAccountId: activeAccountId == _sentinel
        ? this.activeAccountId
        : activeAccountId as String?,
    isAddAccountFlow: isAddAccountFlow ?? this.isAddAccountFlow,
  );

  @override
  List<Object?> get props => [
    status,
    user?.id,
    error,
    errorCode,
    isLoading,
    accounts,
    activeAccountId,
    isAddAccountFlow,
  ];
}
