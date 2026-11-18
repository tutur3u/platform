import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_sections.dart';
import 'package:mobile/features/settings/view/settings_delete_account_row.dart';
import 'package:mocktail/mocktail.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  late _Auth auth;

  setUp(() {
    auth = _Auth();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated().copyWith(
        activeAccountId: 'a',
        accounts: const [
          StoredAuthAccount(
            id: 'a',
            refreshToken: '',
            lastActiveAt: 3,
            addedAt: 1,
            displayName: 'Current',
          ),
          StoredAuthAccount(
            id: 'b',
            refreshToken: '',
            lastActiveAt: 1,
            addedAt: 1,
            displayName: 'Older',
            email: 'older@example.test',
          ),
          StoredAuthAccount(
            id: 'c',
            refreshToken: '',
            lastActiveAt: 2,
            addedAt: 1,
            displayName: 'Recent',
            email: 'recent@example.test',
          ),
        ],
      ),
    );
    when(() => auth.signOutCurrentAccount()).thenAnswer((_) async => true);
  });
  tearDown(() => auth.close());

  Future<void> pump(WidgetTester tester, Widget child) async {
    await tester.pumpApp(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('switch row previews the most recent other account', (
    tester,
  ) async {
    await pump(tester, const ProfileAccountSwitchRow());
    expect(find.text('Switch account'), findsOneWidget);
    expect(find.text('recent@example.test'), findsOneWidget);
    expect(find.text('older@example.test'), findsNothing);
  });

  testWidgets('every quick link is present', (tester) async {
    await pump(tester, const ProfileLinkGroups());
    for (final label in [
      'Settings',
      'Appearance',
      'Notifications',
      'Security and devices',
      'Help and feedback',
      'About',
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
  });

  testWidgets('sign out asks first and cancelling keeps the session', (
    tester,
  ) async {
    await pump(tester, const ProfileDangerGroup());
    await tester.tap(find.byKey(const ValueKey('profile-sign-out')));
    await tester.pumpAndSettle();
    expect(find.text('Log out from this device?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    verifyNever(() => auth.signOutCurrentAccount());
  });

  testWidgets('confirming sign out signs the current account out', (
    tester,
  ) async {
    await pump(tester, const ProfileDangerGroup());
    await tester.tap(find.byKey(const ValueKey('profile-sign-out')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out').last);
    await tester.pumpAndSettle();
    verify(() => auth.signOutCurrentAccount()).called(1);
  });

  testWidgets('delete account opens the deletion page in-app', (tester) async {
    final calls = <(Uri, LaunchMode)>[];
    await pump(
      tester,
      ProfileDangerGroup(
        launch: (uri, mode) async {
          calls.add((uri, mode));
          return true;
        },
      ),
    );
    expect(find.text('Delete account'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('profile-delete-account')));
    await tester.pumpAndSettle();
    expect(calls, [(accountDeletionUri, LaunchMode.inAppBrowserView)]);
  });
}
