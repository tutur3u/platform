import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_offline_preparation.dart';
import 'package:mocktail/mocktail.dart';

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
        ChatOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('chat'), master && enabled);
        await registry['chat']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
        final coordinator = OfflinePreparationCoordinator.forTesting(
          load: (_, _) async => {},
          write: (_, _, _) async {},
          registry: registry,
        );
        await coordinator.run(userId: 'user', workspaceId: 'ws');
        expect(
          coordinator.state.value.products['chat']?.lastSuccess != null,
          master && enabled,
        );
        coordinator.state.dispose();
      });
    }
  }
  test('disabling removes a previous registration', () {
    var enabled = true;
    final registry = OfflinePreparerRegistry(isEnabled: (_) => enabled);
    ChatOfflinePreparation.register(registry, (_) async {});
    enabled = false;
    ChatOfflinePreparation.register(registry, (_) async {});
    expect(registry.appKeys, isEmpty);
  });

  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const base = '/api/v1/workspaces/ws/chat/conversations';
  const listPath = '$base?archived=active&limit=40&offset=0';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('chat-offline-');
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
        'conversations': List.generate(40, (i) => {'id': 'c$i'}),
      },
    );
    for (var i = 0; i < 10; i++) {
      when(() => api.getJson('$base/c$i/messages?limit=60')).thenAnswer(
        (_) async => {
          'messages': List.generate(60, (j) => {'id': 'm$j'}),
        },
      );
    }
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => ChatOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'bounded download opens both first pages offline through read-through',
    () async {
      await prepare();
      verify(() => api.getJson(any())).called(11);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final list = await readThroughJson(
        api: api,
        namespace: 'chat.conversations',
        workspaceId: 'ws',
        path: listPath,
        cacheStore: store,
        cacheUserId: () => owner,
      );
      final messages = await readThroughJson(
        api: api,
        namespace: 'chat.messages',
        workspaceId: 'ws',
        path: '$base/c0/messages?limit=60',
        cacheStore: store,
        cacheUserId: () => owner,
      );
      expect(list['conversations'], hasLength(40));
      expect(messages['messages'], hasLength(60));
      await Future<void>.delayed(Duration.zero);
    },
  );
  test('oversized response fails preparation', () async {
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'conversations': <dynamic>[],
        'padding': 'x' * (ChatOfflinePreparation.maxBytes + 1),
      },
    );
    await expectLater(prepare(), throwsStateError);
  });
  test('account switch during response prevents publication', () async {
    when(() => api.getJson(listPath)).thenAnswer((_) async {
      owner = 'other';
      return {'conversations': <dynamic>[]};
    });
    await expectLater(prepare(), throwsStateError);
  });
}
