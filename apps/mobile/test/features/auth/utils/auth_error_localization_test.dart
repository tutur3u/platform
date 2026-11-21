import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/features/auth/utils/auth_error_localization.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

void main() {
  final l10n = AppLocalizationsEn();

  test('shows the provider message instead of raw exception text', () {
    expect(
      resolveAuthErrorMessage(
        l10n: l10n,
        error: 'PlatformException(org.openid.appauth.oauth_token: -61440)',
        errorCode: AuthErrorCode.googleSignInFailed,
      ),
      l10n.authGoogleSignInFailed,
    );
  });

  test('shows a generic message for raw exception text without a code', () {
    expect(
      resolveAuthErrorMessage(l10n: l10n, error: 'Exception: socket closed'),
      l10n.commonSomethingWentWrong,
    );
  });

  test('keeps readable server messages', () {
    expect(
      resolveAuthErrorMessage(l10n: l10n, error: 'Invalid login credentials'),
      'Invalid login credentials',
    );
  });
}
