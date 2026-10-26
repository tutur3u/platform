import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/view/profile_identity_card.dart';
import 'package:mobile/l10n/l10n.dart';

const ValueKey<String> _edit = ValueKey('profile-edit-identity');

Future<GoRouter> _pump(WidgetTester tester, {Locale? locale}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: ProfileIdentityCard(
              profile: UserProfile(
                id: 'u1',
                displayName: 'Linh Tran',
                email: 'linh@example.com',
              ),
              avatarUrl: null,
              userId: 'u1',
              loading: false,
            ),
          ),
        ),
      ),
      GoRoute(
        path: Routes.settingsProfile,
        builder: (_, _) => const Scaffold(body: Text('Profile settings')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    MaterialApp.router(
      theme: AppTheme.dark,
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('edit is one labelled icon button that opens profile settings', (
    tester,
  ) async {
    await _pump(tester);
    expect(find.byKey(_edit), findsOneWidget);
    // Icon-only: the label is the accessible name, not visible text.
    expect(find.text('Edit profile'), findsNothing);
    expect(find.bySemanticsLabel('Edit profile'), findsOneWidget);
    final size = tester.getSize(find.byKey(_edit));
    expect(size.width, greaterThanOrEqualTo(44));
    expect(size.height, greaterThanOrEqualTo(44));
    // It sits beside the avatar on the trailing edge, not under the email.
    expect(
      tester.getTopLeft(find.byKey(_edit)).dy,
      lessThan(tester.getTopLeft(find.text('Linh Tran')).dy),
    );

    await tester.tap(find.byKey(_edit));
    await tester.pumpAndSettle();
    expect(find.text('Profile settings'), findsOneWidget);
  });

  testWidgets('the edit label is localized', (tester) async {
    await _pump(tester, locale: const Locale('vi'));
    expect(find.bySemanticsLabel('Sửa hồ sơ'), findsOneWidget);
  });
}
