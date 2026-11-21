import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/repositories/provider_sign_in.dart';
import 'package:mobile/data/sources/apple_identity_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockSupabaseClient extends Mock implements SupabaseClient {}

class _MockGoTrueClient extends Mock implements GoTrueClient {}

class _MockGoogleIdentityClient extends Mock implements GoogleIdentityClient {}

class _MockAppleIdentityClient extends Mock implements AppleIdentityClient {}

class _MockOAuthUrlLauncher extends Mock implements OAuthUrlLauncher {}

class _IosPlatform implements DevicePlatform {
  const _IosPlatform();

  @override
  bool get isAndroid => false;

  @override
  bool get isIOS => true;
}

const _redirect = 'com.tuturuuu.app.mobile://login-callback';
const _googleQuery = {'access_type': 'offline', 'prompt': 'consent'};

void main() {
  late GoTrueClient goTrueClient;
  late GoogleIdentityClient googleIdentityClient;
  late OAuthUrlLauncher oauthUrlLauncher;

  ProviderSignIn build({bool iosAppOnMac = false}) {
    final supabaseClient = _MockSupabaseClient();
    when(() => supabaseClient.auth).thenReturn(goTrueClient);
    return ProviderSignIn(
      client: supabaseClient,
      googleIdentityClient: googleIdentityClient,
      appleIdentityClient: _MockAppleIdentityClient(),
      oauthUrlLauncher: oauthUrlLauncher,
      packageInfoLoader: () async => PackageInfo(
        appName: 'Tuturuuu',
        packageName: 'com.tuturuuu.app.mobile',
        version: '1.0.0',
        buildNumber: '1',
      ),
      devicePlatform: const _IosPlatform(),
      isIOSAppOnMac: () async => iosAppOnMac,
      googleWebClientId: 'web-client-id',
      googleIosClientId: '',
    );
  }

  void stubBrowserLaunch() {
    when(
      () => oauthUrlLauncher.launchProviderSignIn(
        authClient: goTrueClient,
        provider: OAuthProvider.google,
        redirectTo: _redirect,
        queryParams: _googleQuery,
      ),
    ).thenAnswer((_) async => true);
  }

  void stubNativeAuthenticateThrows(Object error) {
    when(
      () => googleIdentityClient.initialize(serverClientId: 'web-client-id'),
    ).thenAnswer((_) async {});
    when(() => googleIdentityClient.supportsAuthenticate()).thenReturn(true);
    when(() => googleIdentityClient.authenticate()).thenThrow(error);
  }

  setUp(() {
    goTrueClient = _MockGoTrueClient();
    googleIdentityClient = _MockGoogleIdentityClient();
    oauthUrlLauncher = _MockOAuthUrlLauncher();
  });

  test('routes the iOS app on a Mac to browser OAuth', () async {
    stubBrowserLaunch();

    final result = await build(iosAppOnMac: true).signInWithGoogle();

    expect(result.status, AuthActionStatus.externalFlowStarted);
    verifyNever(
      () => googleIdentityClient.initialize(
        clientId: any(named: 'clientId'),
        serverClientId: any(named: 'serverClientId'),
      ),
    );
  });

  test('falls back to browser OAuth on an AppAuth invalid_audience '
      'platform error', () async {
    stubNativeAuthenticateThrows(
      PlatformException(
        code: 'org.openid.appauth.oauth_token: -61440',
        message:
            'invalid_audience: The audience client and the client need to '
            'be in the same project.',
      ),
    );
    stubBrowserLaunch();

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.externalFlowStarted);
  });

  test('falls back to browser OAuth when an unknown error carries an OAuth '
      'client configuration code', () async {
    stubNativeAuthenticateThrows(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.unknownError,
        description: 'invalid_audience: client projects differ',
      ),
    );
    stubBrowserLaunch();

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.externalFlowStarted);
  });

  test('reports a failure code without raw provider text', () async {
    stubNativeAuthenticateThrows(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.interrupted,
        description: 'PlatformException(interrupted)',
      ),
    );

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.failure);
    expect(result.errorCode, AuthErrorCode.googleSignInFailed);
    expect(result.errorMessage, isNull);
    verifyNever(
      () => oauthUrlLauncher.launchProviderSignIn(
        authClient: goTrueClient,
        provider: OAuthProvider.google,
        redirectTo: any(named: 'redirectTo'),
        queryParams: any(named: 'queryParams'),
        scopes: any(named: 'scopes'),
      ),
    );
  });

  test('keeps an explicit iOS cancel without opening the browser', () async {
    stubNativeAuthenticateThrows(
      const GoogleSignInException(code: GoogleSignInExceptionCode.canceled),
    );

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.cancelled);
    verifyNever(
      () => oauthUrlLauncher.launchProviderSignIn(
        authClient: goTrueClient,
        provider: OAuthProvider.google,
        redirectTo: any(named: 'redirectTo'),
        queryParams: any(named: 'queryParams'),
        scopes: any(named: 'scopes'),
      ),
    );
  });

  test('fails without fallback on an unknown error lacking a client '
      'configuration code', () async {
    stubNativeAuthenticateThrows(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.unknownError,
        description: 'keychain unavailable',
      ),
    );

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.failure);
    expect(result.errorCode, AuthErrorCode.googleSignInFailed);
  });

  test('fails without fallback on a non-AppAuth platform error', () async {
    stubNativeAuthenticateThrows(
      PlatformException(code: 'network_error', message: 'offline'),
    );

    final result = await build().signInWithGoogle();

    expect(result.status, AuthActionStatus.failure);
    expect(result.errorCode, AuthErrorCode.googleSignInFailed);
  });
}
