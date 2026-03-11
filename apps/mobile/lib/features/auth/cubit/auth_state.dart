import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/auth_action_result.dart';
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

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    Object? error = _sentinel,
    Object? errorCode = _sentinel,
    bool? isLoading,
  }) => AuthState._(
    status: status ?? this.status,
    user: user ?? this.user,
    error: error == _sentinel ? this.error : error as String?,
    errorCode: errorCode == _sentinel
        ? this.errorCode
        : errorCode as AuthErrorCode?,
    isLoading: isLoading ?? this.isLoading,
  );

  @override
  List<Object?> get props => [status, user?.id, error, errorCode, isLoading];
}
