import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _MockAuthRepository extends Mock implements AuthRepository {}

supa.User _user() => supa.User.fromJson({
  'id': 'user-1',
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': 'user@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': const <String, dynamic>{},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

void main() {
  group('AuthCubit.signInWithGoogle', () {
    late AuthRepository authRepository;

    setUp(() {
      authRepository = _MockAuthRepository();
      when(() => authRepository.getCurrentUserSync()).thenReturn(null);
      when(() => authRepository.onAuthStateChange()).thenAnswer(
        (_) => const Stream<supa.AuthState>.empty(),
      );
      when(() => authRepository.dispose()).thenReturn(null);
      when(() => authRepository.checkMfaRequired()).thenReturn(false);
      when(
        () => authRepository.getStoredAccounts(),
      ).thenAnswer((_) async => const <StoredAuthAccount>[]);
      when(
        () => authRepository.getActiveStoredAccountId(),
      ).thenAnswer((_) async => null);
      when(
        () => authRepository.syncCurrentSessionToMultiAccountStore(
          switchImmediately: any(named: 'switchImmediately'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => authRepository.signInWithApple(),
      ).thenAnswer((_) async => const AuthActionResult.externalFlowStarted());
      when(
        () => authRepository.signInWithMicrosoft(),
      ).thenAnswer((_) async => const AuthActionResult.externalFlowStarted());
      when(
        () => authRepository.signInWithGithub(),
      ).thenAnswer((_) async => const AuthActionResult.externalFlowStarted());
    });

    blocTest<AuthCubit, AuthState>(
      'authenticates immediately after native Google success',
      build: () {
        when(
          () => authRepository.signInWithGoogle(),
        ).thenAnswer((_) async => const AuthActionResult.success());
        when(() => authRepository.getCurrentUser()).thenAnswer(
          (_) async => _user(),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithGoogle(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        AuthState.authenticated(_user()),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'clears loading and waits for auth listener when browser flow starts',
      build: () {
        when(
          () => authRepository.signInWithGoogle(),
        ).thenAnswer((_) async => const AuthActionResult.externalFlowStarted());
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithGoogle(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: null,
          errorCode: null,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores a localized error code when Google sign-in fails',
      build: () {
        when(
          () => authRepository.signInWithGoogle(),
        ).thenAnswer(
          (_) async => const AuthActionResult.failure(
            AuthErrorCode.googleBrowserLaunchFailed,
          ),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithGoogle(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: null,
          errorCode: AuthErrorCode.googleBrowserLaunchFailed,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores a localized error code when Microsoft sign-in fails',
      build: () {
        when(
          () => authRepository.signInWithMicrosoft(),
        ).thenAnswer(
          (_) async => const AuthActionResult.failure(
            AuthErrorCode.microsoftBrowserLaunchFailed,
          ),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithMicrosoft(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: null,
          errorCode: AuthErrorCode.microsoftBrowserLaunchFailed,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores a localized error code when Apple sign-in fails',
      build: () {
        when(
          () => authRepository.signInWithApple(),
        ).thenAnswer(
          (_) async => const AuthActionResult.failure(
            AuthErrorCode.appleBrowserLaunchFailed,
          ),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithApple(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: null,
          errorCode: AuthErrorCode.appleBrowserLaunchFailed,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores a localized error code when GitHub sign-in fails',
      build: () {
        when(
          () => authRepository.signInWithGithub(),
        ).thenAnswer(
          (_) async => const AuthActionResult.failure(
            AuthErrorCode.githubBrowserLaunchFailed,
          ),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithGithub(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: null,
          errorCode: AuthErrorCode.githubBrowserLaunchFailed,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores repository error messages when present',
      build: () {
        when(
          () => authRepository.signInWithGoogle(),
        ).thenAnswer(
          (_) async => const AuthActionResult.failure(
            AuthErrorCode.googleSignInFailed,
            errorMessage: 'Unacceptable audience in id_token',
          ),
        );
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) => cubit.signInWithGoogle(),
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          isLoading: true,
          error: null,
          errorCode: null,
        ),
        const AuthState.unauthenticated().copyWith(
          isLoading: false,
          error: 'Unacceptable audience in id_token',
          errorCode: AuthErrorCode.googleSignInFailed,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'stores auth callback errors emitted by the Supabase auth stream',
      build: () {
        final controller = StreamController<supa.AuthState>();
        addTearDown(controller.close);
        when(
          () => authRepository.onAuthStateChange(),
        ).thenAnswer((_) => controller.stream);

        final cubit = AuthCubit(authRepository: authRepository);
        controller.addError(const supa.AuthException('OAuth callback failed'));
        return cubit;
      },
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(
          error: 'OAuth callback failed',
          errorCode: null,
          isLoading: false,
        ),
      ],
    );

    late StreamController<supa.AuthState> addAccountFlowErrorController;
    blocTest<AuthCubit, AuthState>(
      'preserves add-account flow when auth stream emits an error',
      build: () {
        addAccountFlowErrorController = StreamController<supa.AuthState>();
        addTearDown(addAccountFlowErrorController.close);
        when(
          () => authRepository.onAuthStateChange(),
        ).thenAnswer((_) => addAccountFlowErrorController.stream);
        return AuthCubit(authRepository: authRepository);
      },
      act: (cubit) async {
        cubit.setAddAccountFlow(enabled: true);
        await Future<void>.delayed(Duration.zero);
        addAccountFlowErrorController.addError(
          const supa.AuthException('OAuth callback failed'),
        );
      },
      expect: () => <AuthState>[
        const AuthState.unauthenticated().copyWith(isAddAccountFlow: true),
        const AuthState.unauthenticated().copyWith(
          error: 'OAuth callback failed',
          errorCode: null,
          isLoading: false,
          isAddAccountFlow: true,
        ),
      ],
    );
  });

  group('AuthCubit.addAccountFlow', () {
    late AuthRepository authRepository;

    setUp(() {
      authRepository = _MockAuthRepository();
      when(() => authRepository.getCurrentUserSync()).thenReturn(_user());
      when(() => authRepository.onAuthStateChange()).thenAnswer(
        (_) => const Stream<supa.AuthState>.empty(),
      );
      when(() => authRepository.dispose()).thenReturn(null);
      when(() => authRepository.checkMfaRequired()).thenReturn(false);
      when(
        () => authRepository.getStoredAccounts(),
      ).thenAnswer((_) async => const <StoredAuthAccount>[]);
      when(
        () => authRepository.getActiveStoredAccountId(),
      ).thenAnswer((_) async => 'user-1');
      when(
        () => authRepository.syncCurrentSessionToMultiAccountStore(
          switchImmediately: any(named: 'switchImmediately'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => authRepository.switchToStoredAccount(any()),
      ).thenAnswer((_) async => (success: false, error: null));
    });

    test(
      'beginAddAccountFlow keeps the current session active',
      () async {
        final cubit = AuthCubit(authRepository: authRepository);
        addTearDown(cubit.close);

        final started = await cubit.beginAddAccountFlow();

        expect(started, isTrue);
        expect(cubit.state.status, AuthStatus.authenticated);
        expect(cubit.state.isAddAccountFlow, isTrue);
        expect(cubit.state.activeAccountId, 'user-1');
        verifyNever(() => authRepository.switchToStoredAccount(any()));
      },
    );

    test(
      'cancelAddAccountFlow exits without restoring when still authenticated',
      () async {
        final cubit = AuthCubit(authRepository: authRepository);
        addTearDown(cubit.close);

        final started = await cubit.beginAddAccountFlow();
        final restored = await cubit.cancelAddAccountFlow();

        expect(started, isTrue);
        expect(restored, isTrue);
        expect(cubit.state.status, AuthStatus.authenticated);
        expect(cubit.state.isAddAccountFlow, isFalse);
        verifyNever(() => authRepository.switchToStoredAccount(any()));
      },
    );
  });
}
