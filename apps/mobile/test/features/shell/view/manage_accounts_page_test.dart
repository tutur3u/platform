import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/view/manage_accounts_page.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';

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
    id: 'active',
    refreshToken: '',
    lastActiveAt: 3,
    addedAt: 1,
    displayName: 'Lan Pham',
    email: 'lan@example.test',
  ),
  StoredAuthAccount(
    id: 'lab',
    refreshToken: '',
    lastActiveAt: 2,
    addedAt: 1,
    displayName: 'Lan at Lab',
    email: 'lan@lab.example.test',
  ),
];

void main() {
  usePhoneSurface();

  late _Auth auth;
  late StreamController<AuthState> states;
  late AuthState current;

  AuthState authState({bool loading = false, String? switching}) =>
      const AuthState.authenticated(_active).copyWith(
        accounts: _accounts,
        isLoading: loading,
        switchingAccountId: switching,
      );

  void emit(AuthState next) {
    current = next;
    states.add(next);
  }

  Future<void> openPage(WidgetTester tester) async {
    current = authState();
    whenListen(auth, states.stream, initialState: current);
    when(() => auth.state).thenAnswer((_) => current);
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => BlocProvider<AuthCubit>.value(
            value: auth,
            child: const ManageAccountsPage(),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    // The toast needs an Overlay above the app's root Navigator.
    await tester.pumpAppRouter(
      router,
      wrap: (app) => Directionality(
        textDirection: TextDirection.ltr,
        child: Overlay(initialEntries: [OverlayEntry(builder: (_) => app)]),
      ),
    );
    await tester.pump(const Duration(milliseconds: 600));
  }

  Future<void> pumpBriefly(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  Finder confirmButton(String label) => find.descendant(
    of: find.byType(AppSheetScaffold),
    matching: find.widgetWithText(AppButton, label),
  );

  // Lets the toast's own timer run out so nothing stays pending.
  Future<void> expireToast(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(seconds: 1));
  }

  setUp(() {
    auth = _Auth();
    states = StreamController<AuthState>.broadcast();
    when(() => auth.isClosed).thenReturn(false);
    when(auth.syncCurrentSessionToStore).thenAnswer((_) async {});
  });

  tearDown(() => states.close());

  testWidgets('removes a saved account after the confirmation', (tester) async {
    final removal = Completer<bool>();
    when(() => auth.removeAccount('lab')).thenAnswer((_) => removal.future);
    await openPage(tester);

    await tester.tap(find.text('Remove account'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Remove account'));
    await pumpBriefly(tester);

    verify(() => auth.removeAccount('lab')).called(1);
    expect(find.byType(NovaLoadingIndicator), findsOneWidget);

    removal.complete(true);
    await pumpBriefly(tester);
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text('Account removed successfully.'), findsOneWidget);
    await expireToast(tester);
  });

  testWidgets('logs out the current account after the confirmation', (
    tester,
  ) async {
    final signOut = Completer<bool>();
    when(auth.signOutCurrentAccount).thenAnswer((_) => signOut.future);
    await openPage(tester);

    await tester.tap(find.text('Log out'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Log out'));
    await pumpBriefly(tester);

    verify(auth.signOutCurrentAccount).called(1);
    expect(find.byType(NovaLoadingIndicator), findsOneWidget);

    signOut.complete(true);
    await pumpBriefly(tester);
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text('Logged out current account.'), findsOneWidget);
    await expireToast(tester);
  });

  for (final (name, next) in [
    ('a switch', authState(switching: 'lab')),
    ('a load', authState(loading: true)),
  ]) {
    testWidgets('a remove confirmed while $name runs does nothing', (
      tester,
    ) async {
      when(() => auth.removeAccount(any())).thenAnswer((_) async => true);
      await openPage(tester);

      await tester.tap(find.text('Remove account'));
      await pumpBriefly(tester);
      emit(next);
      await tester.pump();
      await tester.tap(confirmButton('Remove account'));
      await pumpBriefly(tester);

      verifyNever(() => auth.removeAccount(any()));
      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.text('Account removed successfully.'), findsNothing);
    });

    testWidgets('a log out confirmed while $name runs does nothing', (
      tester,
    ) async {
      when(auth.signOutCurrentAccount).thenAnswer((_) async => true);
      await openPage(tester);

      await tester.tap(find.text('Log out'));
      await pumpBriefly(tester);
      emit(next);
      await tester.pump();
      await tester.tap(confirmButton('Log out'));
      await pumpBriefly(tester);

      verifyNever(auth.signOutCurrentAccount);
      expect(find.byType(NovaLoadingIndicator), findsNothing);
      expect(find.text('Logged out current account.'), findsNothing);
    });
  }

  testWidgets('a throwing remove clears the busy state', (tester) async {
    when(() => auth.removeAccount('lab')).thenThrow(StateError('boom'));
    await openPage(tester);

    await tester.tap(find.text('Remove account'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Remove account'));
    await pumpBriefly(tester);

    expect(tester.takeException(), isA<StateError>());
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text("Couldn't remove this account."), findsOneWidget);
    await expireToast(tester);

    // The page is usable again: a second attempt reaches the cubit.
    await tester.tap(find.text('Remove account'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Remove account'));
    await pumpBriefly(tester);
    verify(() => auth.removeAccount('lab')).called(2);
    expect(tester.takeException(), isA<StateError>());
    await expireToast(tester);
  });

  testWidgets('a throwing log out clears the busy state', (tester) async {
    when(auth.signOutCurrentAccount).thenThrow(StateError('boom'));
    await openPage(tester);

    await tester.tap(find.text('Log out'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Log out'));
    await pumpBriefly(tester);

    expect(tester.takeException(), isA<StateError>());
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text("Couldn't log out this account."), findsOneWidget);
    await expireToast(tester);

    await tester.tap(find.text('Log out'));
    await pumpBriefly(tester);
    await tester.tap(confirmButton('Log out'));
    await pumpBriefly(tester);
    verify(auth.signOutCurrentAccount).called(2);
    expect(tester.takeException(), isA<StateError>());
    await expireToast(tester);
  });
}
