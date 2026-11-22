import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/account_switcher_sheet.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

const _active = User(
  id: 'active',
  email: 'lan@example.test',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '',
);

const _accounts = [
  StoredAuthAccount(
    id: 'lab',
    refreshToken: '',
    lastActiveAt: 3,
    addedAt: 1,
    displayName: 'Lan at Lab',
    email: 'lan@lab.example.test',
  ),
  StoredAuthAccount(
    id: 'expired',
    refreshToken: '',
    lastActiveAt: 2,
    addedAt: 1,
    displayName: 'Minh Tran',
    email: 'minh@example.test',
  ),
];

void main() {
  late _Auth auth;

  AuthState state({String? switching}) =>
      const AuthState.authenticated(_active).copyWith(
        accounts: _accounts,
        expiredAccountIds: const {'expired'},
        switchingAccountId: switching,
      );

  late Future<AccountSwitcherSelection?> result;

  Future<void> open(WidgetTester tester, AuthState initial) async {
    whenListen(auth, const Stream<AuthState>.empty(), initialState: initial);
    await tester.pumpApp(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: Builder(
          builder: (context) => TextButton(
            onPressed: () => result = showAccountSwitcherSheet(context),
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    // A running switch spins forever, so settle by time, not by idle.
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
  }

  setUp(() {
    auth = _Auth();
    when(() => auth.isClosed).thenReturn(false);
    when(auth.syncCurrentSessionToStore).thenAnswer((_) async {});
    when(() => auth.switchAccount(any())).thenAnswer((_) async => true);
  });

  testWidgets('marks the active account and offers Add account', (
    tester,
  ) async {
    await open(tester, state());
    expect(find.text('Accounts'), findsOneWidget);
    expect(find.byKey(const ValueKey('active-account-check')), findsOneWidget);
    expect(find.text('Add account'), findsOneWidget);
    expect(
      find.text(
        'Switching reloads the app as that account. Nothing carries over.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('an expired account reads Session expired and signs in again', (
    tester,
  ) async {
    await open(tester, state());
    final row = find.byKey(const ValueKey('switch-account-expired'));
    expect(
      find.descendant(of: row, matching: find.text('Session expired')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: row, matching: find.text('minh@example.test')),
      findsNothing,
    );
    await tester.tap(
      find.descendant(of: row, matching: find.text('Sign in again')),
    );
    await tester.pumpAndSettle();
    final selection = await result;
    expect(selection?.action, AccountSwitcherAction.signInAgain);
    expect(selection?.email, 'minh@example.test');
    verifyNever(() => auth.switchAccount(any()));
  });

  testWidgets('a switch in progress shows a spinner and locks the list', (
    tester,
  ) async {
    await open(tester, state(switching: 'lab'));
    expect(find.byKey(const ValueKey('account-switch-progress')), findsOne);
    await tester.tap(find.text('Lan at Lab'), warnIfMissed: false);
    await tester.tap(find.text('Add account'), warnIfMissed: false);
    await tester.pump();
    verifyNever(() => auth.switchAccount(any()));
    expect(find.text('Accounts'), findsOneWidget);
  });

  testWidgets('a healthy saved account switches', (tester) async {
    await open(tester, state());
    await tester.tap(find.text('Lan at Lab'));
    await tester.pumpAndSettle();
    verify(() => auth.switchAccount('lab')).called(1);
  });
}
