enum AuthActionStatus {
  success,
  externalFlowStarted,
  cancelled,
  failure,
}

enum AuthErrorCode {
  googleSignInFailed,
  googleBrowserLaunchFailed,
}

class AuthActionResult {
  const AuthActionResult._({
    required this.status,
    this.errorCode,
  });

  const AuthActionResult.success() : this._(status: AuthActionStatus.success);

  const AuthActionResult.externalFlowStarted()
    : this._(status: AuthActionStatus.externalFlowStarted);

  const AuthActionResult.cancelled()
    : this._(status: AuthActionStatus.cancelled);

  const AuthActionResult.failure(AuthErrorCode errorCode)
    : this._(
        status: AuthActionStatus.failure,
        errorCode: errorCode,
      );

  final AuthActionStatus status;
  final AuthErrorCode? errorCode;
}
