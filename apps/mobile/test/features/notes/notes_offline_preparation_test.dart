import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/notes_offline_preparation.dart';
import 'package:mobile/features/notes/notes_page.dart';
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
      test('registration master=$master notes=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        NotesOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('notes'), master && enabled);
        await registry['notes']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['notes']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    NotesOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    NotesOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const base = '/api/v1/workspaces/ws/notes';
  const listPath = '$base?archived=false';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('notes-offline-');
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
    when(() => api.getJsonList(any())).thenAnswer(
      (_) async => [
        {
          'id': 'n1',
          'title': 'Note',
          'content': {'type': 'doc'},
        },
      ],
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => NotesOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'preparer keys equal the Notes screen cache keys for both tabs',
    () async {
      await prepare();
      for (final archived in [false, true]) {
        final key = CacheKey(
          namespace: archived ? 'notes.archive' : 'notes.list',
          userId: owner,
          workspaceId: 'ws',
        );
        expect(
          NotesOfflinePreparation.key(owner, 'ws', archived: archived).value,
          key.value,
        );
        final cached = await store.read<List<dynamic>>(
          key: key,
          decode: (value) => List<dynamic>.from(value! as List),
        );
        expect((cached.data!.single as Map)['id'], 'n1');
      }
    },
  );
  testWidgets('prepared Notes opens the real cold page offline', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    for (final channel in [
      'com.llfbandit.app_links/events',
      'com.llfbandit.record/messages',
    ]) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        (_) async => null,
      );
    }
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
      await NotesOfflinePreparation(
        api: api,
        store: cache,
        currentUser: () => owner,
      ).prepare('ws');
    });
    addTearDown(() async {
      await cache.closeForTesting();
      await supabase.dispose();
    });
    when(
      () => api.getJsonList(any()),
    ).thenThrow(const SocketException('offline'));
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
        child: NotesPage(
          repository: NoteRepository(apiClient: api),
          localAiActor: () => null,
          localAiAuthEvents: const Stream.empty(),
        ),
      ),
    );
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Note'), findsOneWidget);
    expect(tester.takeException(), isNull);
    verify(() => api.getJsonList(listPath)).called(2);
  });
  for (final oversized in [
    List.generate(201, (i) => {'id': '$i'}),
    [
      {'id': 'n', 'content': 'x' * (NotesOfflinePreparation.maxBytes + 1)},
    ],
  ]) {
    test('cap rejects before storing any tab: ${oversized.length}', () async {
      when(() => api.getJsonList(listPath)).thenAnswer((_) async => oversized);
      await expectLater(
        prepare(),
        throwsA(isA<OfflinePreparationUnavailable>()),
      );
      final cached = await store.read<List<dynamic>>(
        key: NotesOfflinePreparation.key(owner, 'ws', archived: false),
        decode: (value) => List<dynamic>.from(value! as List),
      );
      expect(cached.hasValue, isFalse);
    });
  }
  test('account switch prevents publication', () async {
    when(() => api.getJsonList(listPath)).thenAnswer((_) async {
      owner = 'other';
      return [];
    });
    await expectLater(prepare(), throwsStateError);
  });
}
