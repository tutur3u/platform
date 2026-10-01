import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_page.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockTimezoneSettingsCubit extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _MockProfileRepository extends Mock implements ProfileRepository {}

class _MockPermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

class _MockCalendarSettingsCubit extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

const _cachedProfileKey = 'cached-user-profile:user-1';
const _cachedProfileFetchedAtKey = 'cached-user-profile-fetched-at:user-1';

const _cachedProfile = UserProfile(
  id: 'user-1',
  email: 'alex@example.com',
  displayName: 'Alex Nguyen',
  fullName: 'Alex Nguyen',
);

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerFallbackValue(const UserProfile(id: 'fallback-user'));
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      _cachedProfileKey: jsonEncode(_cachedProfile.toJson()),
      _cachedProfileFetchedAtKey: DateTime.now().toIso8601String(),
    });
    ProfileCubit.clearMemoryCache();
    TransactionCategoriesPage.clearCaches();
    WalletsPage.clearCache();
    PackageInfo.setMockInitialValues(
      appName: 'Tuturuuu',
      packageName: 'com.tuturuuu.mobile',
      version: '1.0.0',
      buildNumber: '1',
      buildSignature: '',
    );
  });

  group('settings motion', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _MockAuthCubit authCubit;
    late _MockProfileRepository profileRepository;
    late _MockTimezoneSettingsCubit timezoneCubit;

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      authCubit = _MockAuthCubit();
      profileRepository = _MockProfileRepository();
      timezoneCubit = _MockTimezoneSettingsCubit();
      const timezoneState = TimezoneSettingsState(
        loading: false,
        resolved: true,
      );
      when(() => timezoneCubit.state).thenReturn(timezoneState);
      whenListen(
        timezoneCubit,
        const Stream<TimezoneSettingsState>.empty(),
        initialState: timezoneState,
      );
      when(
        () => timezoneCubit.load(
          userId: any(named: 'userId'),
          workspaceId: any(named: 'workspaceId'),
        ),
      ).thenAnswer((_) async {});
      final authState = AuthState.authenticated(
        supa.User.fromJson({
          'id': 'user-1',
          'aud': 'authenticated',
          'role': 'authenticated',
          'email': 'alex@example.com',
          'app_metadata': const <String, dynamic>{},
          'user_metadata': const <String, dynamic>{
            'display_name': 'Alex Nguyen',
          },
          'created_at': '2024-01-01T00:00:00.000000Z',
        })!,
      );
      when(() => authCubit.state).thenReturn(authState);
      whenListen(
        authCubit,
        const Stream<AuthState>.empty(),
        initialState: authState,
      );
      when(() => profileRepository.dispose()).thenReturn(null);
      when(() => profileRepository.getCurrentUserIdSync()).thenReturn('user-1');
      when(() => profileRepository.getCachedProfile()).thenAnswer(
        (_) async => (profile: _cachedProfile, fetchedAt: DateTime.now()),
      );
      when(
        () => profileRepository.getProfile(),
      ).thenAnswer((_) async => (profile: _cachedProfile, error: null));
      when(
        () => profileRepository.saveCachedProfile(any()),
      ).thenAnswer((_) async {});
      when(
        () => profileRepository.clearCachedProfile(),
      ).thenAnswer((_) async {});
    });

    testWidgets('app settings renders compact top-level sections', (
      tester,
    ) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws'),
      );
      final permissions = _MockPermissionsRepository();
      when(
        () => permissions.getPermissions(wsId: 'ws', userId: 'user-1'),
      ).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: {manageWorkspaceSettingsPermission},
          isCreator: false,
        ),
      );
      final calendar = _MockCalendarSettingsCubit();
      const calendarState = CalendarSettingsState();
      when(() => calendar.state).thenReturn(calendarState);
      whenListen(
        calendar,
        const Stream<CalendarSettingsState>.empty(),
        initialState: calendarState,
      );
      when(
        () => calendar.loadWorkspacePreference('ws'),
      ).thenAnswer((_) async {});
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider<TimezoneSettingsCubit>.value(value: timezoneCubit),
            BlocProvider(
              create: (_) =>
                  AppTabCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider(
              create: (_) =>
                  ThemeCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider(
              create: (_) =>
                  LocaleCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider<CalendarSettingsCubit>.value(value: calendar),
            BlocProvider(
              create: (_) =>
                  ShellProfileCubit(profileRepository: ProfileRepository()),
            ),
          ],
          child: SettingsPage(permissionsRepository: permissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(StaggeredEntry), findsWidgets);
      expect(find.text('Settings'), findsNothing);
      expect(find.text('Personal timezone'), findsOneWidget);
      expect(find.text('Workspace timezone'), findsOneWidget);
      verify(
        () => permissions.getPermissions(wsId: 'ws', userId: 'user-1'),
      ).called(1);
      expect(find.text('Theme'), findsOneWidget);
      expect(find.text('Language'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Experiments'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Experiments'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('About the app'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('About the app'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Session'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Session'), findsOneWidget);
      await tester.ensureVisible(find.text('Open-source licenses'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open-source licenses'));
      await tester.pumpAndSettle();
      expect(find.byType(LicensePage), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('About opens the bundled open source license viewer', (
      tester,
    ) async {
      const state = WorkspaceState(status: WorkspaceStatus.loaded);
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: const SettingsPage(section: SettingsSectionDestination.about),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open-source licenses'));
      await tester.pumpAndSettle();
      expect(find.byType(LicensePage), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('app settings section renders fullscreen section content', (
      tester,
    ) async {
      const state = WorkspaceState(status: WorkspaceStatus.loaded);
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<TimezoneSettingsCubit>.value(value: timezoneCubit),
            BlocProvider(
              create: (_) =>
                  AppTabCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider(
              create: (_) =>
                  ThemeCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider(
              create: (_) =>
                  LocaleCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider(create: (_) => CalendarSettingsCubit()),
            BlocProvider(
              create: (_) =>
                  ShellProfileCubit(profileRepository: ProfileRepository()),
            ),
          ],
          child: const SettingsPage(
            section: SettingsSectionDestination.preferences,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(StaggeredEntry), findsOneWidget);
      expect(find.text('Preferences'), findsOneWidget);
      expect(find.text('Theme'), findsOneWidget);
      expect(find.text('Language'), findsOneWidget);
      expect(find.text('Boards'), findsOneWidget);
      expect(find.text('About the app'), findsNothing);
      expect(find.text('Session'), findsNothing);
    });

    testWidgets(
      'workspace settings keeps personal workspace tiles in one section',
      (tester) async {
        const workspace = Workspace(
          id: 'personal-ws',
          name: 'Alex Nguyen',
          personal: true,
        );
        const state = WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [workspace],
          currentWorkspace: workspace,
          defaultWorkspace: workspace,
        );
        when(() => workspaceCubit.state).thenReturn(state);
        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: state,
        );

        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<TimezoneSettingsCubit>.value(value: timezoneCubit),
              BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            ],
            child: const SettingsWorkspacePage(),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(StaggeredEntry), findsOneWidget);
        expect(find.text('Workspace setup'), findsNothing);
        expect(find.text('Current workspace'), findsOneWidget);
        expect(find.text('Default workspace'), findsOneWidget);
        expect(find.text('Workspace information'), findsOneWidget);
        expect(find.text('Access'), findsNothing);
      },
    );

    testWidgets('profile screen keeps staggered top-level sections', (
      tester,
    ) async {
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<TimezoneSettingsCubit>.value(value: timezoneCubit),
            BlocProvider(
              create: (_) =>
                  AppTabCubit(settingsRepository: SettingsRepository()),
            ),
            BlocProvider<AuthCubit>.value(value: authCubit),
            BlocProvider(
              create: (_) =>
                  ShellProfileCubit(profileRepository: profileRepository),
            ),
          ],
          child: ProfilePage(profileRepository: profileRepository),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(StaggeredEntry), findsAtLeastNWidgets(2));
      expect(find.text('Alex Nguyen'), findsWidgets);
      expect(find.text('Identity'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Avatar'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Avatar'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Account status'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Account status'), findsOneWidget);
    });
  });
}
