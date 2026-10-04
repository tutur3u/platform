import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_backdrop.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pumpGuide(
    WidgetTester tester, {
    bool replay = false,
    bool dark = false,
    double textScale = 1,
    bool reducedMotion = false,
  }) async {
    final router = GoRouter(
      initialLocation: replay ? '/host/guide' : '/guide',
      routes: [
        GoRoute(
          path: '/host',
          builder: (_, _) => const Text('Replay host'),
          routes: [
            GoRoute(
              path: 'guide',
              builder: (_, _) => const OnboardingPage(replay: true),
            ),
          ],
        ),
        GoRoute(path: '/guide', builder: (_, _) => const OnboardingPage()),
        GoRoute(path: Routes.login, builder: (_, _) => const Text('Login')),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      shad.ShadcnApp.router(
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        darkTheme: const shad.ThemeData.dark(
          colorScheme: shad.ColorSchemes.darkZinc,
        ),
        themeMode: dark ? shad.ThemeMode.dark : shad.ThemeMode.light,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          shad.ShadcnLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => ShadcnMaterialBridge.appBuilder(
          context,
          MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScale),
              disableAnimations: reducedMotion,
            ),
            child: child!,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> next(WidgetTester tester) async {
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
  }

  testWidgets('introduces brand, Mira, and actual first-party tools', (
    tester,
  ) async {
    await pumpGuide(tester);
    expect(find.text('Your goals, connected'), findsOneWidget);
    expect(find.text('Tuturuuu'), findsOneWidget);
    expect(find.text('Meet Mira, your AI companion'), findsOneWidget);
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Inventory'), findsOneWidget);
    expect(find.byType(OnboardingBackdrop), findsOneWidget);
  });

  testWidgets('persists role and multiple goals then routes to login', (
    tester,
  ) async {
    await pumpGuide(tester);
    await next(tester);
    await tester.ensureVisible(find.text('Professional'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Professional'));
    await next(tester);
    await tester.ensureVisible(find.text('Focus and plan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Focus and plan'));
    await tester.ensureVisible(find.text('Collaborate'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Collaborate'));
    await next(tester);
    expect(find.text('A toolkit that adapts to you'), findsOneWidget);
    await tester.tap(find.text('Explore Tuturuuu'));
    await tester.pumpAndSettle();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('has_seen_onboarding'), isTrue);
    expect(prefs.getInt('connected_onboarding_role'), 0);
    expect(prefs.getStringList('connected_onboarding_goals'), ['0', '1']);
    expect(find.text('Login'), findsOneWidget);
  });

  testWidgets('skip persists completion without requiring choices', (
    tester,
  ) async {
    await pumpGuide(tester);
    await tester.tap(find.text('Skip for now'));
    await tester.pumpAndSettle();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('has_seen_onboarding'), isTrue);
    expect(prefs.getStringList('connected_onboarding_goals'), isEmpty);
    expect(find.text('Login'), findsOneWidget);
  });

  testWidgets('replay returns to its caller rather than login', (tester) async {
    await pumpGuide(tester, replay: true);
    await tester.tap(find.text('Skip for now'));
    await tester.pumpAndSettle();
    expect(find.text('Replay host'), findsOneWidget);
    expect(find.text('Login'), findsNothing);
  });

  for (final dark in [false, true]) {
    testWidgets('compact enlarged text remains usable, dark=$dark', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await pumpGuide(tester, dark: dark, textScale: 2, reducedMotion: true);
      expect(tester.takeException(), isNull);
      await next(tester);
      expect(find.text('Make Tuturuuu yours'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await next(tester);
      expect(tester.takeException(), isNull);
      await next(tester);
      expect(find.text('Explore Tuturuuu'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final backdrop = tester.widget<AnimatedContainer>(
        find
            .descendant(
              of: find.byType(OnboardingBackdrop),
              matching: find.byType(AnimatedContainer),
            )
            .first,
      );
      expect(backdrop.duration, Duration.zero);
    });
  }
}
