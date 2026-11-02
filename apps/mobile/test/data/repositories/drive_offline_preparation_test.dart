import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/drive_offline_preparation.dart';
import 'package:mobile/data/repositories/drive_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/drive/view/drive_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

class _Auth extends Mock implements AuthCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master chat=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        DriveOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('drive'), master && enabled);
        await registry['drive']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['drive']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    DriveOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    DriveOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('drive-offline-');
    final storage = _Storage();
    final secrets = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    await store.init();
    owner = 'user';
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'data': [
          {'name': 'folder'},
        ],
        'pagination': {'total': 1},
      },
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => DriveOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');
  test('preparer key equals the directory key read by the screen', () async {
    const other = CacheKey(
      namespace: 'drive.directory',
      userId: 'user',
      workspaceId: 'ws',
      params: {'path': 'other-folder'},
    );
    await store.write(
      key: other,
      policy: CachePolicies.offlineCatalog,
      payload: {'data': <Object?>[]},
    );
    await prepare();
    expect(
      (await store.read<Object?>(key: other, decode: (v) => v)).hasValue,
      isTrue,
    );
    final path = DriveEndpoints.list(
      'ws',
      path: '',
      search: '',
      limit: 100,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    );
    when(() => api.getJson(any())).thenThrow(const SocketException('offline'));
    final data = await readThroughJson(
      api: api,
      namespace: 'drive.directory',
      workspaceId: 'ws',
      path: path,
      cacheStore: store,
      cacheUserId: () => owner,
    );
    expect(data['data'], [
      {'name': 'folder'},
    ]);
  });
  testWidgets('prepared Drive opens the real cold page offline', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.app_links/events'),
      (_) async => null,
    );
    final cache = CacheStore.instance;
    await tester.runAsync(() async {
      await initSupabase();
      await supabase.auth.setInitialSession(
        jsonEncode({
          'access_token': 'synthetic',
          'token_type': 'bearer',
          'user': {
            'id': owner,
            'aud': 'authenticated',
            'created_at': '2026-01-01T00:00:00Z',
          },
        }),
      );
      await cache.init();
      await cache.clearScope();
      await DriveOfflinePreparation(
        api: api,
        store: cache,
        currentUser: () => owner,
      ).prepare('ws');
    });
    addTearDown(() async {
      await cache.closeForTesting();
      await supabase.dispose();
    });
    when(() => api.getJson(any())).thenThrow(const SocketException('offline'));
    final workspace = _Workspace();
    when(() => workspace.state).thenReturn(
      WorkspaceState(
        currentWorkspace: Workspace.fromJson(const {
          'id': 'ws',
          'name': 'Test',
        }),
      ),
    );
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    final auth = _Auth();
    when(
      () => auth.state,
    ).thenReturn(AuthState.authenticated(supabase.auth.currentUser!));
    when(() => auth.stream).thenAnswer((_) => const Stream.empty());
    final permissions = _Permissions();
    when(() => permissions.getPermissions(wsId: 'ws')).thenAnswer(
      (_) async => const WorkspacePermissions(
        permissions: {'manage_drive'},
        isCreator: false,
      ),
    );
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: BlocProvider<AuthCubit>.value(
          value: auth,
          child: DrivePage(
            repository: DriveRepository(apiClient: api),
            permissionsRepository: permissions,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(find.text('folder'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  for (final bytes in [false, true]) {
    test('over ${bytes ? "bytes" : "items"} cap stores nothing', () async {
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'data': bytes
              ? <dynamic>[]
              : List.generate(201, (i) => {'name': '$i'}),
          if (bytes) 'padding': 'x' * (DriveOfflinePreparation.maxBytes + 1),
        },
      );
      await expectLater(
        prepare(),
        throwsA(isA<OfflinePreparationUnavailable>()),
      );
      expect(
        store
            .peek<Map<String, dynamic>>(
              key: CacheKey(
                namespace: 'drive.directory',
                userId: owner,
                workspaceId: 'ws',
                params: {
                  'path': DriveEndpoints.list(
                    'ws',
                    path: '',
                    search: '',
                    limit: 100,
                    offset: 0,
                    sortBy: 'name',
                    sortOrder: 'asc',
                  ),
                },
              ),
              decode: (value) => Map<String, dynamic>.from(value! as Map),
            )
            .hasValue,
        isFalse,
      );
    });
  }
}
