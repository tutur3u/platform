import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_page.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

const _cachedProfileKey = 'cached-user-profile';
const _cachedProfileFetchedAtKey = 'cached-user-profile-fetched-at';

const _cachedProfile = UserProfile(
  id: 'user-1',
  email: 'alex@example.com',
  displayName: 'Alex Nguyen',
  fullName: 'Alex Nguyen',
);

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      anonKey: 'test-anon-key',
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      _cachedProfileKey: jsonEncode(_cachedProfile.toJson()),
      _cachedProfileFetchedAtKey: DateTime.now().toIso8601String(),
    });
    ProfileCubit.clearMemoryCache();
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

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
    });

    testWidgets('app settings renders staggered top-level sections', (
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
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider(
              create: (_) => ThemeCubit(
                settingsRepository: SettingsRepository(),
              ),
            ),
            BlocProvider(
              create: (_) => LocaleCubit(
                settingsRepository: SettingsRepository(),
              ),
            ),
            BlocProvider(create: (_) => CalendarSettingsCubit()),
            BlocProvider(
              create: (_) => ShellProfileCubit(
                profileRepository: ProfileRepository(),
              ),
            ),
          ],
          child: const SettingsPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(StaggeredEntry), findsAtLeastNWidgets(2));
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Preferences'), findsOneWidget);
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
    });

    testWidgets(
      'workspace settings keeps personal workspace tiles in one section',
      (
        tester,
      ) async {
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
          BlocProvider<WorkspaceCubit>.value(
            value: workspaceCubit,
            child: const SettingsWorkspacePage(),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(StaggeredEntry), findsOneWidget);
        expect(find.text('Workspace setup'), findsOneWidget);
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
        BlocProvider(
          create: (_) => ShellProfileCubit(
            profileRepository: ProfileRepository(),
          ),
          child: const ProfilePage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(StaggeredEntry), findsAtLeastNWidgets(3));
      expect(find.text('Alex Nguyen'), findsWidgets);
      expect(find.text('Identity'), findsOneWidget);
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
