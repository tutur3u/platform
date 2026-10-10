import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'http://localhost');
  int sends = 0;
  int status = 403;
  @override
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    sends++;
    throw ApiException(message: 'synthetic-private-url', statusCode: status);
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    sends++;
    throw StateError('Profile actor changed');
  }
}

class _Repository extends ProfileRepository {
  _Repository(_Api api, OfflineMutationQueue queue, this.actor)
    : super(
        apiClient: api,
        bannerMutationQueue: queue,
        avatarMutationQueue: queue,
      );
  final String? Function() actor;
  @override
  String? getCurrentUserIdSync() => actor();
}

void main() {
  for (final (status, kind) in [
    (401, ProfileMediaFailureKind.authorization),
    (403, ProfileMediaFailureKind.authorization),
    (409, ProfileMediaFailureKind.conflict),
    (429, ProfileMediaFailureKind.limited),
    (503, ProfileMediaFailureKind.unavailable),
  ]) {
    test(
      'avatar removal preserves HTTP$status without an automatic retry',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'avatar-remove-',
        );
        final storage = _Storage();
        when(
          () => storage.read(key: any(named: 'key')),
        ).thenAnswer((_) async => null);
        when(
          () => storage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((_) async {});
        final store = CacheStore.forTesting(
          secureStorage: storage,
          directoryResolver: () async => directory,
        );
        final api = _Api()..status = status;
        final queue = OfflineMutationQueue.forTesting(
          store: store,
          userId: () => 'owner',
          checkConnectivity: () async => [ConnectivityResult.wifi],
          connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        );
        final repository = _Repository(api, queue, () => 'owner');
        try {
          final result = await repository.removeAvatarResult();
          expect(result.success, isFalse);
          expect(result.failure?.kind, kind);
          expect(result.failure?.diagnostics.status, status);
          expect(
            result.failure?.diagnostics.summary,
            isNot(contains('synthetic-private')),
          );
          expect(api.sends, 1);
          expect(await queue.listPending(), isEmpty);
        } finally {
          repository.dispose();
          await queue.dispose();
          await store.closeForTesting();
          api.dispose();
          await directory.delete(recursive: true);
        }
      },
    );
  }
  for (final action in ['remove', 'remove-avatar', 'banner', 'avatar']) {
    for (final phase in ['cache', 'connectivity']) {
      test(
        '$action returns bounded failure on actor switch during $phase',
        () async {
          final directory = await Directory.systemTemp.createTemp(
            'profile-race-',
          );
          final file = File('${directory.path}/source.png');
          await file.writeAsBytes(
            image.encodePng(image.Image(width: 16, height: 16)),
          );
          final storage = _Storage();
          final secrets = <String, String>{};
          when(() => storage.read(key: any(named: 'key'))).thenAnswer(
            (call) async => secrets[call.namedArguments[#key] as String],
          );
          when(
            () => storage.write(
              key: any(named: 'key'),
              value: any(named: 'value'),
            ),
          ).thenAnswer((call) async {
            secrets[call.namedArguments[#key] as String] =
                call.namedArguments[#value] as String;
          });
          final entered = Completer<void>();
          final release = Completer<void>();
          var actor = 'old';
          final store = CacheStore.forTesting(
            secureStorage: storage,
            directoryResolver: () async {
              if (phase == 'cache') {
                entered.complete();
                await release.future;
              }
              return directory;
            },
          );
          final api = _Api();
          final queue = OfflineMutationQueue.forTesting(
            store: store,
            userId: () => actor,
            checkConnectivity: () async {
              if (phase == 'connectivity' && !entered.isCompleted) {
                entered.complete();
                await release.future;
              }
              return [ConnectivityResult.none];
            },
            connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
          );
          final repository = _Repository(api, queue, () => actor);
          try {
            final pending = action == 'remove'
                ? repository.removeBanner()
                : action == 'remove-avatar'
                ? repository.removeAvatar()
                : action == 'banner'
                ? repository.saveBanner(file)
                : repository.saveAvatar(file);
            await entered.future;
            actor = 'new';
            release.complete();
            final result = await pending;
            expect(result.success, isFalse);
            expect(result.error, 'Profile update failed');
            expect(await store.listPendingMutations(), isEmpty);
            expect(api.sends, 0);
          } finally {
            repository.dispose();
            await queue.dispose();
            await store.closeForTesting();
            api.dispose();
            await directory.delete(recursive: true);
          }
        },
      );
    }
  }
}
