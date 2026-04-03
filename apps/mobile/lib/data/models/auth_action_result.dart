enum AuthActionStatus {
  success,
  externalFlowStarted,
  cancelled,
  failure,
}

enum AuthErrorCode {
  googleSignInFailed,
  googleBrowserLaunchFailed,
  microsoftBrowserLaunchFailed,
  appleSignInFailed,
  appleBrowserLaunchFailed,
  githubBrowserLaunchFailed,
}

class AuthActionResult {
  const AuthActionResult._({
    required this.status,
    this.errorCode,
    this.errorMessage,
  });

  const AuthActionResult.success() : this._(status: AuthActionStatus.success);

  const AuthActionResult.externalFlowStarted()
    : this._(status: AuthActionStatus.externalFlowStarted);

  const AuthActionResult.cancelled()
    : this._(status: AuthActionStatus.cancelled);

  const AuthActionResult.failure(
    AuthErrorCode errorCode, {
    String? errorMessage,
  }) : this._(
         status: AuthActionStatus.failure,
         errorCode: errorCode,
         errorMessage: errorMessage,
       );

  final AuthActionStatus status;
  final AuthErrorCode? errorCode;
  final String? errorMessage;
}
