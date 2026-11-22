import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:mobile/features/onboarding/data/onboarding_interests.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'onboarding_harness.dart';

/// Regression coverage for apps/docs/platform/features/mobile-onboarding.mdx.
void main() {
  late OnboardingHarness h;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    h = OnboardingHarness();
  });

  Future<void> tapKey(WidgetTester tester, String key) async {
    final target = find.byKey(ValueKey(key));
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  Future<void> next(WidgetTester tester) =>
      tapKey(tester, 'onboarding-primary');

  Future<void> skip(WidgetTester tester) async {
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
  }

  OnboardingOutcome? outcome() => h.gate.outcomeFor(onboardingUser.id);

  group('step 1, Make it yours', () {
    testWidgets('prefills the name and keeps product news off', (tester) async {
      await h.pump(tester);
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsOneWidget);
      expect(find.text('Make it yours'), findsOneWidget);
      expect(find.text('Lan Nguyen'), findsWidgets);
      final news = tester.widget<AppSwitch>(
        find.byKey(const ValueKey('onboarding-product-news')),
      );
      expect(news.value, isFalse);
      // No user-level product email preference exists yet.
      expect(news.onChanged, isNull);
      expect(
        find.text('Coming soon. It stays off until you can choose it.'),
        findsOneWidget,
      );
    });

    testWidgets('saves a changed name through the profile API', (tester) async {
      await h.pump(tester);
      await tester.enterText(
        find.byKey(const ValueKey('onboarding-display-name')),
        'Lan N.',
      );
      await next(tester);
      expect(h.services.names, ['Lan N.']);
      expect(find.text('Set up your space'), findsOneWidget);
    });

    testWidgets('a failed save shows once, then Continue moves on', (
      tester,
    ) async {
      h.services.saveNameResult = false;
      await h.pump(tester);
      await tester.enterText(
        find.byKey(const ValueKey('onboarding-display-name')),
        'Lan N.',
      );
      await next(tester);
      expect(find.textContaining("Your name wasn't saved"), findsOneWidget);
      await next(tester);
      expect(find.text('Set up your space'), findsOneWidget);
      expect(h.services.names, ['Lan N.']);
    });

    testWidgets('language and appearance use the existing settings', (
      tester,
    ) async {
      await h.pump(tester);
      for (final label in ['VI', 'Dark']) {
        await tester.ensureVisible(find.text(label));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label));
        await tester.pump();
      }
      verify(() => h.locale.setLocale(const Locale('vi'))).called(1);
      verify(
        () => h.theme.setThemeMode(
          ThemeCubit.parseThemeMode('dark'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).called(1);
    });
  });

  group('skip', () {
    for (final step in [0, 1, 2]) {
      testWidgets('at step ${step + 1} records a skip and opens the app', (
        tester,
      ) async {
        await h.pump(tester);
        for (var i = 0; i < step; i++) {
          await next(tester);
        }
        expect(find.text('Step ${step + 1} of 3'), findsOneWidget);
        await skip(tester);
        expect(outcome(), OnboardingOutcome.skipped);
        expect(find.text('Landed ${Routes.home}'), findsOneWidget);
      });
    }

    testWidgets('a replay from Settings records nothing', (tester) async {
      await h.pump(tester, replay: true);
      await skip(tester);
      expect(outcome(), isNull);
      expect(find.text('Replay host'), findsOneWidget);
    });
  });

  group('step 2, Set up your space', () {
    Future<void> toSpace(WidgetTester tester) async {
      await h.pump(tester);
      await next(tester);
    }

    testWidgets('Just me keeps the personal workspace', (tester) async {
      await toSpace(tester);
      await next(tester);
      expect(find.text('What brings you here?'), findsOneWidget);
      verifyNever(
        () => h.workspaces.createWorkspace(
          any(),
          avatarFile: any(named: 'avatarFile'),
        ),
      );
    });

    testWidgets('With my team creates the workspace by name', (tester) async {
      h.createsWorkspace('Lotus Design Lab');
      await toSpace(tester);
      await tapKey(tester, 'onboarding-space-team');
      await next(tester);
      expect(find.text('Workspace name is required'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('onboarding-workspace-name')),
        'Lotus Design Lab',
      );
      await next(tester);
      verify(
        () => h.workspaces.createWorkspace(
          'Lotus Design Lab',
          avatarFile: any(named: 'avatarFile'),
        ),
      ).called(1);
      verify(() => h.workspaces.selectWorkspace(any())).called(1);
      expect(find.text('What brings you here?'), findsOneWidget);
    });

    testWidgets('shows the workspace limit inline', (tester) async {
      h.setWorkspaces(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: personalWorkspace,
          limits: WorkspaceLimits(canCreate: false, currentCount: 5, limit: 5),
        ),
      );
      await toSpace(tester);
      await tapKey(tester, 'onboarding-space-team');
      await tester.enterText(
        find.byKey(const ValueKey('onboarding-workspace-name')),
        'One too many',
      );
      await next(tester);
      expect(find.text('You have reached the workspace limit'), findsOneWidget);
      expect(find.text('Set up your space'), findsOneWidget);
    });

    testWidgets('a failed create keeps the step with the API message', (
      tester,
    ) async {
      when(
        () => h.workspaces.createWorkspace(
          any(),
          avatarFile: any(named: 'avatarFile'),
        ),
      ).thenThrow(const ApiException(message: 'Name taken', statusCode: 409));
      await toSpace(tester);
      await tapKey(tester, 'onboarding-space-team');
      await tester.enterText(
        find.byKey(const ValueKey('onboarding-workspace-name')),
        'Taken',
      );
      await next(tester);
      expect(find.text('Name taken'), findsOneWidget);
    });

    testWidgets('joins a pending invite', (tester) async {
      h.services.invite = const OnboardingInvite(
        workspaceId: 'sunrise',
        workspaceName: 'Sunrise Studio',
        inviterName: 'Minh Tran',
        notificationId: 'n1',
      );
      await toSpace(tester);
      expect(find.text('Sunrise Studio'), findsOneWidget);
      expect(find.text('Invited by Minh Tran'), findsOneWidget);
      await tapKey(tester, 'onboarding-invite-join');
      expect(h.services.accepted, ['sunrise']);
      expect(find.text('Joined'), findsOneWidget);
    });

    testWidgets('no invite card without an open invite', (tester) async {
      await toSpace(tester);
      expect(find.byKey(const ValueKey('onboarding-invite')), findsNothing);
    });
  });

  group('step 3, What brings you here?', () {
    Future<void> toInterests(WidgetTester tester) async {
      await h.pump(tester);
      await next(tester);
      await next(tester);
    }

    testWidgets('Teach or learn sets the education mode', (tester) async {
      await toInterests(tester);
      await tapKey(tester, 'onboarding-interest-education');
      await tapKey(tester, 'onboarding-interest-calendar');
      await next(tester);
      expect(h.modes.saves, ['account:education']);
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getStringList(OnboardingChoices.interestsKey(onboardingUser.id)),
        ['calendar', 'education'],
      );
      expect(
        prefs.getStringList(OnboardingChoices.goalsKey(onboardingUser.id)),
        ['focus', 'learn'],
      );
      expect(h.services.goals, [
        ['focus', 'learn'],
      ]);
      // Regression: recording here let the router close the flow before
      // All set showed; completion is recorded when the person leaves it.
      expect(outcome(), isNull);
      expect(find.text("You're all set, Lan"), findsOneWidget);
    });

    testWidgets('any other choice keeps the general mode', (tester) async {
      await toInterests(tester);
      await tapKey(tester, 'onboarding-interest-finance');
      await next(tester);
      expect(h.modes.saves, ['account:general']);
    });

    testWidgets('tiles toggle as checkboxes', (tester) async {
      await toInterests(tester);
      await tapKey(tester, 'onboarding-interest-mira');
      await tapKey(tester, 'onboarding-interest-mira');
      await next(tester);
      expect(h.services.goals, isEmpty);
    });
  });

  group('All set', () {
    Future<void> toDone(WidgetTester tester) async {
      await h.pump(tester);
      for (var i = 0; i < 3; i++) {
        await next(tester);
      }
    }

    testWidgets('Open Tuturuuu continues to the app', (tester) async {
      await toDone(tester);
      expect(find.text('Open Tuturuuu'), findsOneWidget);
      await next(tester);
      expect(find.text('Landed ${Routes.home}'), findsOneWidget);
      expect(outcome(), OnboardingOutcome.completed);
    });

    for (final (key, route) in [
      ('task', Routes.tasks),
      ('calendar', '${Routes.settingsApps}/calendar'),
      ('notifications', Routes.settingsReminders),
    ]) {
      testWidgets('$key row deep-links to $route', (tester) async {
        await toDone(tester);
        await tapKey(tester, 'onboarding-next-$key');
        expect(find.text('Landed $route'), findsOneWidget);
      });
    }
  });
}
