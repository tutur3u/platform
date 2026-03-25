import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockSupabaseClient extends Mock implements SupabaseClient {}

class _MockGoTrueClient extends Mock implements GoTrueClient {}

class _MockGoogleIdentityClient extends Mock implements GoogleIdentityClient {}

class _MockOAuthUrlLauncher extends Mock implements OAuthUrlLauncher {}

class _AndroidPlatform implements DevicePlatform {
  const _AndroidPlatform();

  @override
  bool get isAndroid => true;

  @override
  bool get isIOS => false;
}

class _IosPlatform implements DevicePlatform {
  const _IosPlatform();

  @override
  bool get isAndroid => false;

  @override
  bool get isIOS => true;
}

PackageInfo _packageInfo() => PackageInfo(
  appName: 'Tuturuuu',
  packageName: 'com.tuturuuu.app.mobile.dev',
  version: '1.0.0',
  buildNumber: '1',
);

void main() {
  late SupabaseClient supabaseClient;
  late GoTrueClient goTrueClient;
  late GoogleIdentityClient googleIdentityClient;
  late OAuthUrlLauncher oauthUrlLauncher;
  late AuthRepository repository;

  setUp(() {
    supabaseClient = _MockSupabaseClient();
    goTrueClient = _MockGoTrueClient();
    googleIdentityClient = _MockGoogleIdentityClient();
    oauthUrlLauncher = _MockOAuthUrlLauncher();

    when(() => supabaseClient.auth).thenReturn(goTrueClient);
    when(() => googleIdentityClient.signOut()).thenAnswer((_) async {});

    repository = AuthRepository(
      supabaseClient: supabaseClient,
      googleIdentityClient: googleIdentityClient,
      oauthUrlLauncher: oauthUrlLauncher,
      packageInfoLoader: () async => _packageInfo(),
      devicePlatform: const _AndroidPlatform(),
      googleWebClientId: 'web-client-id',
      googleIosClientId: 'ios-client-id',
    );
  });

  group('AuthRepository.signInWithGoogle', () {
    test('returns success after native Google sign-in succeeds', () async {
      when(
        () => googleIdentityClient.initialize(
          serverClientId: 'web-client-id',
        ),
      ).thenAnswer((_) async {});
      when(() => googleIdentityClient.supportsAuthenticate()).thenReturn(true);
      when(
        () => googleIdentityClient.authenticate(),
      ).thenAnswer(
        (_) async => const GoogleIdentityTokens(
          idToken: 'id-token',
          accessToken: 'access-token',
        ),
      );
      when(
        () => goTrueClient.signInWithIdToken(
          provider: OAuthProvider.google,
          idToken: 'id-token',
          accessToken: 'access-token',
        ),
      ).thenAnswer((_) async => AuthResponse());

      final result = await repository.signInWithGoogle();

      expect(result.status, AuthActionStatus.success);
      verifyNever(
        () => oauthUrlLauncher.launchProviderSignIn(
          authClient: goTrueClient,
          provider: OAuthProvider.google,
          redirectTo: any(named: 'redirectTo'),
          queryParams: any(named: 'queryParams'),
        ),
      );
    });

    test(
      'falls back to browser OAuth after recoverable native failure',
      () async {
        when(
          () => googleIdentityClient.initialize(
            serverClientId: 'web-client-id',
          ),
        ).thenAnswer((_) async {});
        when(
          () => googleIdentityClient.supportsAuthenticate(),
        ).thenReturn(true);
        when(
          () => googleIdentityClient.authenticate(),
        ).thenThrow(
          const GoogleSignInException(
            code: GoogleSignInExceptionCode.clientConfigurationError,
            description: 'native configuration failed',
          ),
        );
        when(
          () => oauthUrlLauncher.launchProviderSignIn(
            authClient: goTrueClient,
            provider: OAuthProvider.google,
            redirectTo: 'com.tuturuuu.app.mobile.dev://login-callback',
            queryParams: const {
              'access_type': 'offline',
              'prompt': 'consent',
            },
          ),
        ).thenAnswer((_) async => true);

        final result = await repository.signInWithGoogle();

        expect(result.status, AuthActionStatus.externalFlowStarted);
        verifyNever(
          () => goTrueClient.signInWithIdToken(
            provider: OAuthProvider.google,
            idToken: any(named: 'idToken'),
            accessToken: any(named: 'accessToken'),
          ),
        );
      },
    );

    test(
      'returns a failure instead of silently falling back',
      () async {
        when(
          () => googleIdentityClient.initialize(
            serverClientId: 'web-client-id',
          ),
        ).thenAnswer((_) async {});
        when(
          () => googleIdentityClient.supportsAuthenticate(),
        ).thenReturn(true);
        when(
          () => googleIdentityClient.authenticate(),
        ).thenAnswer(
          (_) async => const GoogleIdentityTokens(
            idToken: 'id-token',
            accessToken: 'access-token',
          ),
        );
        when(
          () => goTrueClient.signInWithIdToken(
            provider: OAuthProvider.google,
            idToken: 'id-token',
            accessToken: 'access-token',
          ),
        ).thenThrow(
          const AuthException('Supabase rejected the Google token'),
        );

        final result = await repository.signInWithGoogle();

        expect(result.status, AuthActionStatus.failure);
        expect(result.errorCode, AuthErrorCode.googleSignInFailed);
        verifyNever(
          () => oauthUrlLauncher.launchProviderSignIn(
            authClient: goTrueClient,
            provider: OAuthProvider.google,
            redirectTo: any(named: 'redirectTo'),
            queryParams: any(named: 'queryParams'),
          ),
        );
      },
    );

    test(
      'does not fall back when native sign-in is explicitly cancelled',
      () async {
        when(
          () => googleIdentityClient.initialize(
            serverClientId: 'web-client-id',
          ),
        ).thenAnswer((_) async {});
        when(
          () => googleIdentityClient.supportsAuthenticate(),
        ).thenReturn(true);
        when(
          () => googleIdentityClient.authenticate(),
        ).thenThrow(
          const GoogleSignInException(
            code: GoogleSignInExceptionCode.canceled,
            description: 'user cancelled',
          ),
        );

        final result = await repository.signInWithGoogle();

        expect(result.status, AuthActionStatus.cancelled);
        verifyNever(
          () => oauthUrlLauncher.launchProviderSignIn(
            authClient: goTrueClient,
            provider: OAuthProvider.google,
            redirectTo: any(named: 'redirectTo'),
            queryParams: any(named: 'queryParams'),
          ),
        );
      },
    );

    test(
      'uses bundled iOS config when no explicit iOS client ID is provided',
      () async {
        repository = AuthRepository(
          supabaseClient: supabaseClient,
          googleIdentityClient: googleIdentityClient,
          oauthUrlLauncher: oauthUrlLauncher,
          packageInfoLoader: () async => _packageInfo(),
          devicePlatform: const _IosPlatform(),
          googleWebClientId: 'web-client-id',
          googleIosClientId: '',
        );

        when(
          () => googleIdentityClient.initialize(
            serverClientId: 'web-client-id',
          ),
        ).thenAnswer((_) async {});
        when(
          () => googleIdentityClient.supportsAuthenticate(),
        ).thenReturn(true);
        when(
          () => googleIdentityClient.authenticate(),
        ).thenAnswer(
          (_) async => const GoogleIdentityTokens(
            idToken: 'id-token',
            accessToken: 'access-token',
          ),
        );
        when(
          () => goTrueClient.signInWithIdToken(
            provider: OAuthProvider.google,
            idToken: 'id-token',
            accessToken: 'access-token',
          ),
        ).thenAnswer((_) async => AuthResponse());

        final result = await repository.signInWithGoogle();

        expect(result.status, AuthActionStatus.success);
        verify(
          () => googleIdentityClient.initialize(
            serverClientId: 'web-client-id',
          ),
        ).called(1);
      },
    );
  });

  group('AuthRepository.signInWithApple', () {
    test('launches Apple OAuth in the browser', () async {
      when(
        () => oauthUrlLauncher.launchProviderSignIn(
          authClient: goTrueClient,
          provider: OAuthProvider.apple,
          redirectTo: 'com.tuturuuu.app.mobile.dev://login-callback',
          queryParams: const {'prompt': 'consent'},
        ),
      ).thenAnswer((_) async => true);

      final result = await repository.signInWithApple();

      expect(result.status, AuthActionStatus.externalFlowStarted);
    });

    test('returns an Apple launch error when OAuth cannot start', () async {
      when(
        () => oauthUrlLauncher.launchProviderSignIn(
          authClient: goTrueClient,
          provider: OAuthProvider.apple,
          redirectTo: 'com.tuturuuu.app.mobile.dev://login-callback',
          queryParams: const {'prompt': 'consent'},
        ),
      ).thenAnswer((_) async => false);

      final result = await repository.signInWithApple();

      expect(result.status, AuthActionStatus.failure);
      expect(result.errorCode, AuthErrorCode.appleBrowserLaunchFailed);
    });
  });
}
