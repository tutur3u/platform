import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/pump_app.dart';
import '../audience_mode/audience_mode_fakes.dart';

class MockAuth extends MockCubit<AuthState> implements AuthCubit {}

class MockWorkspaces extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class MockLocale extends MockCubit<LocaleState> implements LocaleCubit {}

class MockTheme extends MockCubit<ThemeState> implements ThemeCubit {}

const onboardingUser = User(
  id: 'lan',
  email: 'lan@example.test',
  appMetadata: {},
  userMetadata: {'display_name': 'Lan Nguyen'},
  aud: 'authenticated',
  createdAt: '',
);

const personalWorkspace = Workspace(id: 'personal', personal: true);

class FakeOnboardingServices implements OnboardingServices {
  OnboardingInvite? invite;
  bool saveNameResult = true;
  bool? avatarResult;
  bool acceptFails = false;
  final List<String> names = [];
  final List<String> accepted = [];
  final List<List<String>> goals = [];

  @override
  Future<bool> saveDisplayName(String userId, String displayName) async {
    names.add(displayName);
    return saveNameResult;
  }

  @override
  Future<bool?> changeAvatar(BuildContext context, String userId) async =>
      avatarResult;

  @override
  Future<OnboardingInvite?> pendingInvite(String userId) async => invite;

  @override
  Future<void> acceptInvite(String userId, OnboardingInvite invite) async {
    if (acceptFails) throw Exception('offline');
    accepted.add(invite.workspaceId);
  }

  @override
  Future<void> syncGoals(String userId, List<String> goals) async =>
      this.goals.add(goals);
}

/// Everything an onboarding test drives, with the page mounted at
/// /onboarding and plain destinations for where it leads.
class OnboardingHarness {
  OnboardingHarness() {
    registerFallbackValue(personalWorkspace);
    registerFallbackValue(const Locale('en'));
    registerFallbackValue(ThemeCubit.parseThemeMode('system'));
    const auth = AuthState.authenticated(onboardingUser);
    when(() => this.auth.state).thenReturn(auth);
    whenListen(this.auth, const Stream<AuthState>.empty(), initialState: auth);
    setWorkspaces(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [personalWorkspace],
        currentWorkspace: personalWorkspace,
        limits: WorkspaceLimits(canCreate: true, currentCount: 1, limit: 5),
      ),
    );
    when(() => workspaces.selectWorkspace(any())).thenAnswer((_) async {});
    when(
      () => workspaces.loadWorkspaces(
        forceRefresh: any(named: 'forceRefresh'),
        preferredWorkspaceId: any(named: 'preferredWorkspaceId'),
      ),
    ).thenAnswer((_) async {});
    when(() => locale.state).thenReturn(const LocaleState());
    whenListen(
      locale,
      const Stream<LocaleState>.empty(),
      initialState: const LocaleState(),
    );
    when(() => locale.setLocale(any())).thenAnswer((_) async {});
    when(() => theme.state).thenReturn(const ThemeState());
    whenListen(
      theme,
      const Stream<ThemeState>.empty(),
      initialState: const ThemeState(),
    );
    when(
      () => theme.setThemeMode(any(), isCurrent: any(named: 'isCurrent')),
    ).thenAnswer((_) async => true);
  }

  final auth = MockAuth();
  final workspaces = MockWorkspaces();
  final locale = MockLocale();
  final theme = MockTheme();
  final services = FakeOnboardingServices();
  final modes = FakeAudienceModeRepository();
  late final audience = AudienceModeCubit(
    repository: modes,
    store: MemoryAudienceModeStore(),
  );
  final gate = OnboardingGate();

  void setWorkspaces(WorkspaceState state) {
    when(() => workspaces.state).thenReturn(state);
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );
  }

  void createsWorkspace(String name) =>
      when(
        () => workspaces.createWorkspace(
          any(),
          avatarFile: any(named: 'avatarFile'),
        ),
      ).thenAnswer(
        (_) async => WorkspaceCreationResult(
          workspace: Workspace(id: 'team', name: name),
          avatarUploadFailed: false,
        ),
      );

  Future<void> pump(
    WidgetTester tester, {
    bool replay = false,
    Brightness brightness = Brightness.light,
    Locale locale = const Locale('en'),
    Key? boundaryKey,
  }) async {
    final router = GoRouter(
      initialLocation: replay ? '/host' : Routes.onboarding,
      routes: [
        GoRoute(
          path: '/host',
          builder: (context, _) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => OnboardingPage(
                    replay: true,
                    services: services,
                    gate: gate,
                  ),
                ),
              ),
              child: const Text('Replay host'),
            ),
          ),
        ),
        GoRoute(
          path: Routes.onboarding,
          builder: (_, _) => OnboardingPage(services: services, gate: gate),
        ),
        for (final path in [
          Routes.home,
          Routes.tasks,
          '${Routes.settingsApps}/calendar',
          Routes.settingsReminders,
        ])
          GoRoute(
            path: path,
            builder: (_, _) => Scaffold(body: Text('Landed $path')),
          ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<LocaleCubit>.value(value: this.locale),
          BlocProvider<ThemeCubit>.value(value: theme),
          BlocProvider<AudienceModeCubit>.value(value: audience),
        ],
        child: routedSorbetTestApp(
          router: router,
          locale: locale,
          sorbet: const SorbetTheme(),
          brightness: brightness,
          boundaryKey: boundaryKey,
        ),
      ),
    );
    await tester.pump();
    if (replay) {
      await tester.tap(find.text('Replay host'));
      await tester.pumpAndSettle();
    }
  }
}
