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
  testWidgets('edit is one labelled button that opens profile settings', (
    tester,
  ) async {
    await _pump(tester);
    expect(find.byKey(_edit), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(_edit),
        matching: find.text('Edit profile'),
      ),
      findsOneWidget,
    );
    final size = tester.getSize(find.byKey(_edit));
    expect(size.height, greaterThanOrEqualTo(44));

    // It shares the text column's trailing gutter and is centred in the band
    // beside the avatar's lower half, clear of the cover edge.
    final card = tester.getRect(
      find.byKey(const ValueKey('profile-overview-content')),
    );
    final name = tester.getRect(find.text('Linh Tran'));
    final label = tester.getRect(find.text('Edit profile'));
    final edit = tester.getRect(find.byKey(_edit));
    expect(name.left - card.left, 16);
    expect(card.right - edit.right, closeTo(16, 0.5));
    // The band is the avatar's lower 40dp, which ends 12dp above the name.
    final bandCentre = name.top - 12 - 20;
    expect(edit.center.dy, closeTo(bandCentre, 0.5));
    expect(label.center.dy, closeTo(bandCentre, 1));

    await tester.tap(find.byKey(_edit));
    await tester.pumpAndSettle();
    expect(find.text('Profile settings'), findsOneWidget);
  });

  testWidgets('the edit label is localized', (tester) async {
    await _pump(tester, locale: const Locale('vi'));
    expect(find.text('Sửa hồ sơ'), findsOneWidget);
  });
}
