import 'package:equatable/equatable.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

enum AuthStatus {
  /// Initial state while checking persisted session.
  unknown,

  /// User is authenticated and has a valid session.
  authenticated,

  /// No valid session.
  unauthenticated,
}

class AuthState extends Equatable {
  const AuthState._({
    this.status = AuthStatus.unknown,
    this.user,
    this.error,
    this.isLoading = false,
  });

  const AuthState.unknown() : this._();

  const AuthState.authenticated(User user)
      : this._(status: AuthStatus.authenticated, user: user);

  const AuthState.unauthenticated({String? error})
      : this._(status: AuthStatus.unauthenticated, error: error);

  final AuthStatus status;
  final User? user;
  final String? error;
  final bool isLoading;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? error,
    bool? isLoading,
  }) =>
      AuthState._(
        status: status ?? this.status,
        user: user ?? this.user,
        error: error,
        isLoading: isLoading ?? this.isLoading,
      );

  @override
  List<Object?> get props => [status, user?.id, error, isLoading];
}
