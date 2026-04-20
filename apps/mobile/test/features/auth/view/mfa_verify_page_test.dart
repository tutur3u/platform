import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/view/mfa_verify_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  group('MfaVerifyPage', () {
    late AuthCubit authCubit;

    setUp(() {
      authCubit = _MockAuthCubit();
      when(() => authCubit.verifyMfa(any())).thenAnswer((_) async => true);
      when(() => authCubit.signOutAllAccounts()).thenAnswer((_) async {});
    });

    testWidgets('submits a pasted code through the custom OTP field', (
      tester,
    ) async {
      const state = AuthState.unauthenticated();
      when(() => authCubit.state).thenReturn(state);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider.value(value: authCubit, child: const MfaVerifyPage()),
      );
      await tester.pump();

      await tester.enterText(
        find.byKey(const ValueKey('auth-otp-input')),
        '123456',
      );
      await tester.pump();

      verify(() => authCubit.verifyMfa('123456')).called(1);
      expect(find.text('Verify'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
    });
  });
}
