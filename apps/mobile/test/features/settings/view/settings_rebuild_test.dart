import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Calendar extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

const _initial = WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: 'ws', name: 'Original workspace'),
);
// A device preference row; per-app rows moved to Settings > Apps.
const ValueKey<String> _hapticsRow = ValueKey('settings-haptics-row');
const ValueKey<String> _workspaceRow = ValueKey('settings-workspace-row');

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('workspace refresh does not rebuild unrelated Settings rows', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 2000);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    final harness = _Harness();
    addTearDown(harness.dispose);
    await harness.pump(tester);
    expect(find.byKey(_hapticsRow), findsOneWidget);
    expect(find.byKey(_workspaceRow), findsOneWidget);

    final rebuilds = <Key, int>{};
    final previous = debugOnRebuildDirtyWidget;
    debugOnRebuildDirtyWidget = (element, builtOnce) {
      previous?.call(element, builtOnce);
      final widget = element.widget;
      if (widget is SettingsTile && widget.key != null) {
        rebuilds.update(widget.key!, (count) => count + 1, ifAbsent: () => 1);
      }
    };
    addTearDown(() => debugOnRebuildDirtyWidget = previous);

    for (final state in [
      _initial.copyWith(status: WorkspaceStatus.loading),
      _initial.copyWith(hiddenModuleIds: ['unrelated-module']),
      _initial.copyWith(isCreating: true),
      _initial,
    ]) {
      harness.scopes.add(state);
      await tester.pump();
      await tester.pump();
    }
    expect(
      {
        'haptics': rebuilds[_hapticsRow] ?? 0,
        'workspace': rebuilds[_workspaceRow] ?? 0,
      },
      {'haptics': 0, 'workspace': 0},
    );
    expect(find.text('Original workspace'), findsOneWidget);
    verify(
      () => harness.permissions.getPermissions(wsId: 'ws', userId: 'user'),
    ).called(1);

    rebuilds.clear();
    harness.scopes.add(
      _initial.copyWith(
        currentWorkspace: const Workspace(id: 'ws', name: 'Renamed workspace'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Renamed workspace'), findsOneWidget);
    expect(rebuilds[_workspaceRow] ?? 0, greaterThan(0));
    expect(rebuilds[_hapticsRow] ?? 0, 0);

    rebuilds.clear();
    harness.scopes.add(
      _initial.copyWith(
        currentWorkspace: const Workspace(id: 'other', name: 'Other workspace'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Other workspace'), findsOneWidget);
    expect(rebuilds[_hapticsRow] ?? 0, greaterThan(0));
    verify(
      () => harness.permissions.getPermissions(wsId: 'other', userId: 'user'),
    ).called(1);
    verify(() => harness.calendar.loadWorkspacePreference('other')).called(1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });
}

class _Harness {
  _Harness() {
    whenListen(workspaces, scopes.stream, initialState: _initial);
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'user',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          email: 'user@example.test',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    whenListen(
      calendar,
      const Stream<CalendarSettingsState>.empty(),
      initialState: const CalendarSettingsState(),
    );
    whenListen(
      timezone,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: const TimezoneSettingsState(loading: false, resolved: true),
    );
    when(
      () => calendar.loadWorkspacePreference(any()),
    ).thenAnswer((_) async {});
    when(
      () => permissions.getPermissions(
        wsId: any(named: 'wsId'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer(
      (_) async => const WorkspacePermissions(
        permissions: {manageWorkspaceSettingsPermission},
        isCreator: false,
      ),
    );
  }

  final scopes = StreamController<WorkspaceState>.broadcast();
  final workspaces = _Workspaces();
  final auth = _Auth();
  final calendar = _Calendar();
  final timezone = _Timezone();
  final permissions = _Permissions();
  final settings = SettingsRepository();
  late final finance = FinancePreferencesCubit(settingsRepository: settings);
  late final theme = ThemeCubit(settingsRepository: settings);
  late final locale = LocaleCubit(settingsRepository: settings);

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<CalendarSettingsCubit>.value(value: calendar),
          BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
          BlocProvider.value(value: finance),
          BlocProvider.value(value: theme),
          BlocProvider.value(value: locale),
        ],
        child: SettingsPage(permissionsRepository: permissions),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> dispose() async {
    unawaited(scopes.close());
    await workspaces.close();
    await auth.close();
    await calendar.close();
    await timezone.close();
    await finance.close();
    await theme.close();
    await locale.close();
  }
}
