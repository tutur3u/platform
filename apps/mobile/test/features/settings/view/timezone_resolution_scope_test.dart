import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/calendar_timezone_scope.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Calendar extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

// Actual TimezoneSettingsRepository parses these responses. No preference
// cubit, provider, tile, root Preferences section or native helper is mocked.
class _Api extends ApiClient {
  String personal = 'auto';
  String workspace = 'auto';
  int reads = 0;
  int writes = 0;
  bool fail = false;
  Completer<Map<String, dynamic>>? pending;
  final delayedPaths = <String, Completer<Map<String, dynamic>>>{};
  final workspaceZones = <String, String>{};

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    reads++;
    if (fail) {
      throw const ApiException(message: 'Synthetic failure', statusCode: 503);
    }
    if (pending != null) return await pending!.future;
    if (delayedPaths.containsKey(path)) {
      return await delayedPaths[path]!.future;
    }
    return {
      'timezone': path == TimezoneSettingsRepository.personalPath
          ? personal
          : workspaceZones[path] ?? workspace,
    };
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    writes++;
    return body;
  }
}

AuthState _signedIn(String id) => AuthState.authenticated(
  User.fromJson({
    'id': id,
    'aud': 'authenticated',
    'role': 'authenticated',
    'app_metadata': <String, dynamic>{},
    'user_metadata': <String, dynamic>{},
    'created_at': '2026-01-01T00:00:00Z',
  })!,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_timezone');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late _Api api;
  late TimezoneSettingsRepository repository;
  late StreamController<AuthState> authEvents;
  late StreamController<WorkspaceState> workspaceEvents;
  late _Auth auth;
  late _Workspace workspace;
  late _Calendar calendar;
  late _Permissions permissions;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    api = _Api();
    repository = TimezoneSettingsRepository(apiClient: api);
    authEvents = StreamController<AuthState>.broadcast();
    workspaceEvents = StreamController<WorkspaceState>.broadcast();
    auth = _Auth();
    workspace = _Workspace();
    calendar = _Calendar();
    permissions = _Permissions();
    whenListen(auth, authEvents.stream, initialState: _signedIn('user'));
    whenListen(
      workspace,
      workspaceEvents.stream,
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws'),
      ),
    );
    whenListen(
      calendar,
      const Stream<CalendarSettingsState>.empty(),
      initialState: const CalendarSettingsState(),
    );
    when(
      () => calendar.loadWorkspacePreference(any()),
    ).thenAnswer((_) async {});
    when(
      () => permissions.getPermissions(
        wsId: any(named: 'wsId'),
        userId: any(named: 'userId'),
      ),
    ).thenThrow(Exception('Synthetic permission lookup unavailable'));
    messenger.setMockMethodCallHandler(channel, (_) async => 'UTC');
  });

  tearDown(() async {
    messenger.setMockMethodCallHandler(channel, null);
    await authEvents.close();
    await workspaceEvents.close();
    await auth.close();
    await workspace.close();
    await calendar.close();
    repository.dispose();
    api.dispose();
  });

  Future<TimezoneSettingsCubit> mount(
    WidgetTester tester, {
    AuthState? initialAuth,
    Future<String> Function()? deviceLoader,
    bool root = false,
  }) async {
    if (initialAuth != null) {
      whenListen(auth, authEvents.stream, initialState: initialAuth);
    }
    late TimezoneSettingsCubit cubit;
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider<CalendarSettingsCubit>.value(value: calendar),
          BlocProvider(
            create: (_) => ThemeCubit(settingsRepository: SettingsRepository()),
          ),
          BlocProvider(
            create: (_) =>
                LocaleCubit(settingsRepository: SettingsRepository()),
          ),
        ],
        child: CalendarTimezoneScope(
          repository: repository,
          deviceLoader: deviceLoader,
          loadTimeout: const Duration(seconds: 1),
          child: Builder(
            builder: (context) {
              cubit = context.read<TimezoneSettingsCubit>();
              if (root) {
                return SettingsPage(
                  section: SettingsSectionDestination.preferences,
                  permissionsRepository: permissions,
                );
              }
              final id = context.watch<AuthCubit>().state.user?.id;
              final wsId = context
                  .watch<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              return Column(
                children: [
                  TimezoneSettingsTile(userId: id, workspaceId: wsId),
                  TimezoneSettingsTile(
                    userId: id,
                    workspaceId: wsId,
                    workspace: true,
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
    await tester.pump();
    return cubit;
  }

  testWidgets('real root auth arrival resolves both rows without false UTC', (
    tester,
  ) async {
    final cubit = await mount(
      tester,
      initialAuth: const AuthState.unknown(),
      root: true,
    );
    expect(cubit.state.loading, isFalse);
    expect(cubit.state.resolved, isFalse);
    expect(find.text('Effective timezone: UTC'), findsNothing);
    expect(api.reads, 0);
    api.personal = 'Asia/Ho_Chi_Minh';
    authEvents.add(_signedIn('user'));
    await tester.pumpAndSettle();
    expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
    expect(cubit.state.resolved, isTrue);
    expect(find.text('Personal timezone'), findsOneWidget);
    expect(find.text('Workspace timezone'), findsOneWidget);
    expect(api.reads, 2);
    expect(api.writes, 0);
    // Permission failure keeps the workspace editor read-only.
    await tester.tap(find.text('Workspace timezone'));
    await tester.pump();
    expect(find.byType(EditableText), findsNothing);
  });

  testWidgets(
    'mounted workspace arrival and switch reject late prior response',
    (tester) async {
      whenListen(
        workspace,
        workspaceEvents.stream,
        initialState: const WorkspaceState(),
      );
      final delayed = Completer<Map<String, dynamic>>();
      api.delayedPaths[TimezoneSettingsRepository.workspacePath('a')] = delayed;
      api.workspaceZones[TimezoneSettingsRepository.workspacePath('b')] =
          'Europe/London';
      final cubit = await mount(tester, root: true);
      await tester.pumpAndSettle();
      workspaceEvents.add(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'a'),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(cubit.state.resolved, isFalse);
      expect(find.text('Effective timezone: UTC'), findsNothing);
      workspaceEvents.add(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'b'),
        ),
      );
      await tester.pumpAndSettle();
      expect(cubit.state.effective, 'Europe/London');
      delayed.complete({'timezone': 'Asia/Ho_Chi_Minh'});
      await tester.pumpAndSettle();
      expect(cubit.state.effective, 'Europe/London');
      expect(find.text('Effective timezone: Asia/Ho_Chi_Minh'), findsNothing);
      expect(api.writes, 0);
      await tester.tap(find.text('Workspace timezone'));
      await tester.pump();
      expect(find.byType(EditableText), findsNothing);
    },
  );

  testWidgets('API error terminates even while native device is pending', (
    tester,
  ) async {
    api.fail = true;
    final device = Completer<String>();
    final cubit = await mount(tester, deviceLoader: () => device.future);
    expect(cubit.state.failed, isTrue);
    expect(cubit.state.loading, isFalse);
    expect(find.text('Effective timezone: UTC'), findsNothing);
    expect(find.text('Unknown'), findsNWidgets(2));
    await cubit.save('UTC');
    expect(api.writes, 0);
    device.complete('Europe/Paris');
    await tester.pump();
    expect(cubit.state.resolved, isFalse);
  });

  for (final source in ['API', 'device']) {
    testWidgets('$source pending times out, retries and ignores late result', (
      tester,
    ) async {
      final apiPending = Completer<Map<String, dynamic>>();
      final devicePending = Completer<String>();
      var waiting = true;
      if (source == 'API') api.pending = apiPending;
      final cubit = await mount(
        tester,
        deviceLoader: () => source == 'device' && waiting
            ? devicePending.future
            : Future.value('UTC'),
      );
      expect(cubit.state.loading, isTrue);
      await cubit.save('UTC');
      expect(api.writes, 0);
      await tester.pump(const Duration(seconds: 2));
      expect(cubit.state.failed, isTrue);
      expect(cubit.state.loading, isFalse);
      expect(find.text('Effective timezone: UTC'), findsNothing);
      waiting = false;
      api.pending = null;
      await tester.tap(find.text('Personal timezone'));
      await tester.pumpAndSettle();
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.effective, 'UTC');
      apiPending.complete({'timezone': 'Europe/Paris'});
      devicePending.complete('Europe/Paris');
      await tester.pump();
      expect(cubit.state.effective, 'UTC');
      expect(api.writes, 0);
    });
  }

  testWidgets(
    'real native plugin failure is unknown, retry verifies true UTC',
    (tester) async {
      messenger.setMockMethodCallHandler(channel, (_) async {
        throw PlatformException(code: 'synthetic unavailable');
      });
      final cubit = await mount(tester);
      expect(cubit.state.failed, isTrue);
      expect(cubit.state.resolved, isFalse);
      expect(find.text('Effective timezone: UTC'), findsNothing);
      messenger.setMockMethodCallHandler(channel, (_) async => 'UTC');
      await tester.tap(find.text('Personal timezone'));
      await tester.pumpAndSettle();
      expect(cubit.state.resolved, isTrue);
      expect(find.text('Effective timezone: UTC'), findsNWidgets(2));
      expect(api.writes, 0);
    },
  );

  for (final owner in ['personal', 'workspace']) {
    testWidgets(
      '$owner override resolves without device; last auto cannot write',
      (tester) async {
        if (owner == 'personal') {
          api.personal = 'UTC';
        } else {
          api.workspace = 'Asia/Ho_Chi_Minh';
        }
        messenger.setMockMethodCallHandler(channel, (_) async {
          throw PlatformException(code: 'synthetic unavailable');
        });
        final cubit = await mount(tester);
        expect(cubit.state.resolved, isTrue);
        expect(
          cubit.state.effective,
          owner == 'personal' ? 'UTC' : 'Asia/Ho_Chi_Minh',
        );
        await cubit.save(
          'auto',
          workspace: owner == 'workspace',
          canManageWorkspace: true,
        );
        expect(api.writes, 0);
        expect(cubit.state.failed, isTrue);
        expect(
          cubit.state.effective,
          owner == 'personal' ? 'UTC' : 'Asia/Ho_Chi_Minh',
        );
      },
    );
  }

  testWidgets(
    'same-scope failed revalidation retains exact resolved preference',
    (tester) async {
      api.personal = 'Asia/Ho_Chi_Minh';
      final cubit = await mount(tester);
      api.fail = true;
      await cubit.reload();
      await tester.pump();
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
      expect(cubit.state.failed, isTrue);
      expect(cubit.state.loading, isFalse);
    },
  );
}
