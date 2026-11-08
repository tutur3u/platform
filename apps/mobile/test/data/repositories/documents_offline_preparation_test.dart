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
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/repositories/documents_offline_preparation.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/documents/view/documents_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _Workspace extends Mock implements WorkspaceCubit {}

class _Api extends Mock implements ApiClient {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master documents=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        DocumentsOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('documents'), master && enabled);
        await registry['documents']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['documents']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    DocumentsOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    DocumentsOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const listPath = '/api/v1/workspaces/ws/documents?limit=30&offset=0';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('documents-offline-');
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
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'data': [
          {'id': 'd1', 'name': 'Document', 'content': 'private body'},
        ],
      },
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => DocumentsOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'prepared metadata is read by the exact default list key offline',
    () async {
      expect(DocumentsOfflinePreparation.path('ws'), listPath);
      const other = CacheKey(
        namespace: 'documents.list',
        userId: 'user',
        workspaceId: 'ws',
        params: {'path': '$listPath&search=older'},
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
      verify(() => api.getJson(any())).called(1);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final result = await readThroughJson(
        api: api,
        namespace: 'documents.list',
        workspaceId: 'ws',
        path: listPath,
        cacheStore: store,
        cacheUserId: () => owner,
      );
      final row = (result['data'] as List).single as Map;
      expect(row['id'], 'd1');
      expect(row.containsKey('content'), isFalse);
      await Future<void>.delayed(Duration.zero);
    },
  );
  testWidgets('prepared Documents opens the real cold page offline', (
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
      await DocumentsOfflinePreparation(
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
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: DocumentsPage(repository: DocumentRepository(apiClient: api)),
      ),
    );
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Document'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test('item cap rejects before publishing', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'data': List.generate(201, (i) => {'id': '$i'}),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
  });
  test('oversized response fails preparation', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'data': <dynamic>[],
        'padding': 'x' * (DocumentsOfflinePreparation.maxBytes + 1),
      },
    );
    await expectLater(prepare(), throwsA(isA<OfflinePreparationUnavailable>()));
  });
  test('account switch during response prevents publication', () async {
    when(() => api.getJson(listPath)).thenAnswer((_) async {
      owner = 'other';
      return {'data': <dynamic>[]};
    });
    await expectLater(prepare(), throwsStateError);
  });
}
