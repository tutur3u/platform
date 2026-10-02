import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late SupabaseClient client;
  late WorkspacePermissionsRepository repository;
  late String? actor;
  late bool offline;
  late bool networkAvailable;
  late bool grant;
  late int status;
  late List<Uri> reads;
  Completer<void>? gate;

  const permissionKey = CacheKey(
    namespace: 'workspace.permissions',
    userId: 'user',
    workspaceId: 'ws',
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('offline-permissions-');
    final secure = _SecureStorage();
    final secrets = <String, String>{};
    when(
      () => secure.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secure,
      directoryResolver: () async => directory,
    );
    actor = 'user';
    offline = false;
    networkAvailable = true;
    grant = true;
    status = 200;
    reads = [];
    gate = null;
    client = SupabaseClient(
      'https://example.test',
      'test-key',
      postgrestOptions: const PostgrestClientOptions(retryEnabled: false),
      httpClient: MockClient((request) async {
        reads.add(request.url);
        final granted = grant;
        final responseStatus = status;
        await gate?.future;
        if (offline) throw const SocketException('Offline');
        if (responseStatus != 200) {
          return http.Response(
            jsonEncode({'message': 'Denied', 'code': '$responseStatus'}),
            responseStatus,
            request: request,
            headers: {'content-type': 'application/json'},
          );
        }
        final Object data;
        if (request.url.path.endsWith('workspace_role_members')) {
          data = [
            {
              'workspace_roles': {
                'workspace_role_permissions': [
                  if (granted) {'permission': 'manage_inventory'},
                ],
              },
            },
          ];
        } else if (request.url.path.endsWith('workspaces')) {
          data = {'creator_id': 'someone-else'};
        } else {
          data = [
            {'permission': 'view_inventory'},
          ];
        }
        return http.Response(
          jsonEncode(data),
          200,
          request: request,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    repository = WorkspacePermissionsRepository(
      client: client,
      cacheStore: store,
      currentUserId: () => actor,
      networkAvailable: () async => networkAvailable,
    );
  });

  tearDown(() async {
    await client.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'transport failure uses scoped hint but online refresh revokes grants',
    () async {
      expect(
        (await repository.getPermissions(
          wsId: 'ws',
        )).containsPermission('manage_inventory'),
        isTrue,
      );
      offline = true;
      expect(
        (await repository.getPermissions(
          wsId: 'ws',
        )).containsPermission('manage_inventory'),
        isTrue,
      );
      expect(
        (await repository.getPermissions(
          wsId: 'another',
        )).containsPermission('manage_inventory'),
        isFalse,
      );
      actor = 'another';
      expect(
        (await repository.getPermissions(
          wsId: 'ws',
        )).containsPermission('manage_inventory'),
        isFalse,
      );
      actor = 'user';
      reads.clear();
      offline = false;
      grant = false;
      expect(
        (await repository.getPermissions(
          wsId: 'ws',
        )).containsPermission('manage_inventory'),
        isFalse,
      );
      expect(reads.length, 3);
      final roleQuery = reads.first.queryParameters;
      expect(roleQuery['user_id'], 'eq.user');
      expect(roleQuery['workspace_roles.ws_id'], 'eq.ws');
      expect(
        roleQuery['workspace_roles.workspace_role_permissions.enabled'],
        'eq.true',
      );
    },
  );

  test('no interface returns hint without server retry delay', () async {
    await repository.getPermissions(wsId: 'ws');
    reads.clear();
    networkAvailable = false;
    expect(
      (await repository.getPermissions(
        wsId: 'ws',
      )).containsPermission('manage_inventory'),
      isTrue,
    );
    expect(reads, isEmpty);
    await expectLater(
      repository.prepareOffline('ws'),
      throwsA(isA<SocketException>()),
    );
    expect(reads, isEmpty);
  });

  for (final denial in [401, 403]) {
    test(
      '$denial purges stored hint and offline cannot resurrect it',
      () async {
        await repository.getPermissions(wsId: 'ws');
        status = denial;
        expect(
          (await repository.getPermissions(wsId: 'ws')).permissions,
          isEmpty,
        );
        expect(
          (await store.read<Object?>(
            key: permissionKey,
            decode: (row) => row,
          )).hasValue,
          isFalse,
        );
        offline = true;
        expect(
          (await repository.getPermissions(wsId: 'ws')).permissions,
          isEmpty,
        );
      },
    );
  }

  test('server errors deny rather than reuse a stored grant', () async {
    await repository.getPermissions(wsId: 'ws');
    status = 500;
    expect((await repository.getPermissions(wsId: 'ws')).permissions, isEmpty);
  });

  test(
    'actor switch during server reads cannot save or return old grants',
    () async {
      gate = Completer<void>();
      final request = repository.getPermissions(wsId: 'ws');
      await Future<void>.delayed(Duration.zero);
      actor = 'another';
      gate!.complete();
      expect((await request).permissions, isEmpty);
      expect(
        (await store.read<Object?>(
          key: permissionKey,
          decode: (row) => row,
        )).hasValue,
        isFalse,
      );
    },
  );

  test('strict preparation primes and verifies permission hint', () async {
    await repository.prepareOffline('ws');
    await OfflineDownloadManifest.verifyScope('user', 'ws');
    offline = true;
    expect(
      (await repository.getPermissions(
        wsId: 'ws',
      )).containsPermission('manage_inventory'),
      isTrue,
    );
    await expectLater(
      repository.prepareOffline('ws'),
      throwsA(isA<SocketException>()),
    );
  });
  test(
    'a late older grant cannot replace a newer permission revocation',
    () async {
      final blocked = Completer<void>();
      gate = blocked;
      final older = repository.getPermissions(wsId: 'ws');
      while (reads.length < 3) {
        await Future<void>.delayed(Duration.zero);
      }
      gate = null;
      grant = false;
      final newer = await repository.getPermissions(wsId: 'ws');
      expect(newer.containsPermission('manage_inventory'), isFalse);
      blocked.complete();
      expect((await older).containsPermission('manage_inventory'), isFalse);
      networkAvailable = false;
      expect(
        (await repository.getPermissions(
          wsId: 'ws',
        )).containsPermission('manage_inventory'),
        isFalse,
      );
    },
  );
}
