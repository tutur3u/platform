import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/l10n/l10n.dart';

String? resolveAuthErrorMessage({
  required AppLocalizations l10n,
  String? error,
  AuthErrorCode? errorCode,
}) {
  if (error != null && error.isNotEmpty && !_isRawExceptionText(error)) {
    return error;
  }

  switch (errorCode) {
    case AuthErrorCode.googleSignInFailed:
      return l10n.authGoogleSignInFailed;
    case AuthErrorCode.googleBrowserLaunchFailed:
      return l10n.authGoogleBrowserLaunchFailed;
    case AuthErrorCode.microsoftBrowserLaunchFailed:
      return l10n.authMicrosoftBrowserLaunchFailed;
    case AuthErrorCode.appleSignInFailed:
      return l10n.authAppleSignInFailed;
    case AuthErrorCode.appleBrowserLaunchFailed:
      return l10n.authAppleBrowserLaunchFailed;
    case AuthErrorCode.githubBrowserLaunchFailed:
      return l10n.authGithubBrowserLaunchFailed;
    case null:
      return error == null || error.isEmpty
          ? null
          : l10n.commonSomethingWentWrong;
  }
}

/// Plugin and Dart exception text (`PlatformException(...)`,
/// `Exception: ...`, `Bad state: ...`) is diagnostic output, not a message
/// for people.
bool _isRawExceptionText(String error) {
  return RegExp(
    r"^(\w*Exception\b|\w+Error[:(]|Bad state:|Instance of ')",
  ).hasMatch(error.trimLeft());
}
