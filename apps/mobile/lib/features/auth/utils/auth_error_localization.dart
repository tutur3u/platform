import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/l10n/l10n.dart';

String? resolveAuthErrorMessage({
  required AppLocalizations l10n,
  String? error,
  AuthErrorCode? errorCode,
}) {
  if (error != null && error.isNotEmpty) {
    return error;
  }

  switch (errorCode) {
    case AuthErrorCode.googleSignInFailed:
      return l10n.authGoogleSignInFailed;
    case AuthErrorCode.googleBrowserLaunchFailed:
      return l10n.authGoogleBrowserLaunchFailed;
    case null:
      return null;
  }
}
