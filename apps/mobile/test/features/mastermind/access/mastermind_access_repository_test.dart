import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#rollout
void main() {
  late _Api api;
  String? user;

  MastermindAccessRepository repository() =>
      MastermindAccessRepository(userId: () => user, apiClient: api);

  void answer(Object? body) => when(
    () => api.getJson(MastermindAccessRepository.accessPath),
  ).thenAnswer((_) async => body! as Map<String, dynamic>);

  setUpAll(() => FlutterSecureStorage.setMockInitialValues({}));

  setUp(() async {
    await CacheStore.instance.clearScope();
    api = _Api();
    user = 'user-a';
  });

  test('returns the server answer', () async {
    answer({'enabled': true});
    expect(await repository().isEnabled(), isTrue);

    answer({'enabled': false});
    expect(await repository().isEnabled(), isFalse);
  });

  test('rejects a malformed answer', () async {
    answer({'enabled': 'yes'});
    await expectLater(repository().isEnabled(), throwsFormatException);
  });

  test('signed out never asks and is denied', () async {
    user = null;
    expect(await repository().isEnabled(), isFalse);
    verifyNever(() => api.getJson(any()));
  });

  test("offline reuses this user's last server answer", () async {
    answer({'enabled': true});
    await repository().isEnabled();

    when(
      () => api.getJson(MastermindAccessRepository.accessPath),
    ).thenThrow(const ApiException.transport(message: 'offline'));
    expect(await repository().isEnabled(), isTrue);

    user = 'user-b';
    await expectLater(repository().isEnabled(), throwsA(isA<ApiException>()));
  });

  test('an HTTP failure never falls back to the cache', () async {
    answer({'enabled': true});
    await repository().isEnabled();

    when(
      () => api.getJson(MastermindAccessRepository.accessPath),
    ).thenThrow(const ApiException(message: 'Unauthorized', statusCode: 401));
    await expectLater(repository().isEnabled(), throwsA(isA<ApiException>()));
  });
}
