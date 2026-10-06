import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as image;
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'http://localhost');
  final posts = <String>[];
  final operations = <Object?>[];
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    posts.add(path);
    operations.add((body! as Map)['operationId']);
    return {
      'operationId': (body as Map)['operationId'],
      'publicUrl': 'https://cdn.example.test/profile.webp',
      'uploadUrl': 'https://upload.example.test/profile',
    };
  }
}

class _Repository extends ProfileRepository {
  _Repository(_Api api, http.Client httpClient, OfflineMutationQueue queue)
    : super(
        apiClient: api,
        httpClient: httpClient,
        bannerMutationQueue: queue,
        avatarMutationQueue: queue,
      );
  String? actor = 'owner-a';
  @override
  String? getCurrentUserIdSync() => actor;
  @override
  Future<({UserProfile? profile, String? error})> getProfile() async =>
      (profile: actor == null ? null : UserProfile(id: actor!), error: null);
  @override
  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async => (profile: null, fetchedAt: null);
  @override
  Future<void> saveCachedProfile(UserProfile profile) async {}
}

void main() {
  for (final banner in [false, true]) {
    for (final (status, kind) in [
      (400, ProfileMediaFailureKind.image),
      (401, ProfileMediaFailureKind.authorization),
      (403, ProfileMediaFailureKind.authorization),
      (409, ProfileMediaFailureKind.conflict),
      (413, ProfileMediaFailureKind.size),
      (429, ProfileMediaFailureKind.limited),
      (503, ProfileMediaFailureKind.unavailable),
    ]) {
      test('actual repository/Cubit banner=$banner PUT$status '
          'safe failure or stable queued result', () async {
        ProfileCubit.clearMemoryCache();
        final directory = await Directory.systemTemp.createTemp(
          'profile-contract-',
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
        final store = CacheStore.forTesting(
          secureStorage: storage,
          directoryResolver: () async => directory,
        );
        final queue = OfflineMutationQueue.forTesting(
          store: store,
          userId: () => 'owner-a',
          checkConnectivity: () async => [ConnectivityResult.wifi],
          connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        );
        final api = _Api();
        final httpClient = MockClient(
          (_) async => http.Response(
            'synthetic-provider-private-text',
            status,
            headers: {'retry-after': '60'},
          ),
        );
        final repository = _Repository(api, httpClient, queue);
        final cubit = ProfileCubit(profileRepository: repository);
        try {
          await cubit.loadProfile();
          final accepted = await (banner
              ? cubit.uploadBanner(file)
              : cubit.uploadAvatar(file));
          if (banner && status == 503) {
            expect(accepted, isTrue);
            expect(cubit.state.mediaFailure, isNull);
            final pending = await queue.listPending();
            expect(pending.length, 1);
            expect(pending.single.method, 'PROFILE_BANNER_UPLOAD');
            expect(
              pending.single.payload!['operationId'],
              api.operations.single,
            );
            expect(pending.single.replaySafe, isTrue);
            expect(api.posts.length, 1);
            return;
          }
          expect(accepted, isFalse);
          final failure = cubit.state.mediaFailure!;
          expect(failure.kind, kind);
          expect(failure.diagnostics.status, status);
          expect(failure.diagnostics.retryAfter, 60);
          expect(
            failure.diagnostics.summary,
            'diagnostics=v1; stage=profileUpload; kind=http; '
            'status=$status; retryAfter=60',
          );
          expect(cubit.state.error, 'Profile update failed');
          expect(await queue.listPending(), isEmpty);
          expect(api.posts.length, 1);
          cubit.clearMediaFailure();
          expect(cubit.state.mediaFailure, isNull);
          expect(cubit.state.mediaTarget, isNull);
        } finally {
          await cubit.close();
          api.dispose();
          httpClient.close();
          await queue.dispose();
          await directory.delete(recursive: true);
        }
      });
    }
  }
  test(
    'failure category and copy never derive from arbitrary message or code',
    () {
      final failure = ProfileMediaFailure.capture(
        const ApiException(
          message: 'synthetic-private-url',
          code: 'synthetic-arbitrary',
          statusCode: 429,
          retryAfter: 60,
        ),
      );
      expect(failure.kind, ProfileMediaFailureKind.limited);
      expect(failure.diagnostics.summary.contains('synthetic'), isFalse);
      final receipt = ProfileMediaFailure.capture(
        const ApiException(
          message: 'synthetic',
          code: 'PROFILE_UPLOAD_RECEIPT_INVALID',
          statusCode: 0,
          failureKind: ApiFailureKind.response,
        ),
      );
      expect(receipt.kind, ProfileMediaFailureKind.receipt);
    },
  );
}
