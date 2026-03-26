import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/auth_action_result.dart';
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
        () => authRepository.signInWithApple(),
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
  });
}
