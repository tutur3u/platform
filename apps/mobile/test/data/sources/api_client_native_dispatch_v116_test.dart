// UNEXECUTED: final HTTP mutation boundary, no live auth or provider.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';

import '../../features/assistant/view/assistant_native_dispatch_v116_harness.dart';
import '../../features/assistant/view/assistant_settings_repair_harness.dart';

class _ThrowingClient extends http.BaseClient {
  int calls = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    calls++;
    throw StateError('Synthetic synchronous send invocation failure');
  }
}

const _path =
    '/api/v1/workspaces/$repairWorkspace'
    '/chat/conversations/$repairChat/messages';

void main() {
  for (final status in [201, 401, 403, 429, 500]) {
    test('native one-dispatch stream does not response-replay HTTP '
        '$status', () async {
      final port = NativeDispatchPort()..responseStatus = status;
      addTearDown(port.api.dispose);
      var prompts = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'synthetic';
      };
      addTearDown(() => ApiVerification.requestToken = null);
      final admission = ApiMutationAdmission(
        actorId: repairActor,
        isCurrent: () => true,
      );
      final response = await port.api.sendJsonStreamAcknowledged(
        'POST',
        '/api/v1/workspaces/$repairWorkspace'
            '/chat/conversations/$repairChat/messages',
        {
          'content': 'one',
          'clientRequestId': repairActor,
          'attachments': <dynamic>[],
        },
        admission: admission,
      );
      await response.stream.drain<void>();
      expect(port.posts, hasLength(1));
      expect(prompts, 0);
      expect(admission.definitelyNotDispatched, isFalse);
    });
  }
  test('native credential ABA rejects before HTTP with originating '
      'generation', () async {
    final port = NativeDispatchPort()..expired = true;
    addTearDown(() {
      port.release();
      port.api.dispose();
    });
    var generation = 1;
    final admission = ApiMutationAdmission(
      actorId: repairActor,
      isCurrent: () => generation == 1,
    );
    final result = port.api.sendJsonStreamAcknowledged(
      'POST',
      '/api/v1/workspaces/$repairWorkspace'
          '/chat/conversations/$repairChat/messages',
      {
        'content': 'held',
        'clientRequestId': repairActor,
        'attachments': <dynamic>[],
      },
      admission: admission,
    );
    final observed = expectLater(
      result,
      throwsA(
        isA<ApiMutationNotDispatched>().having(
          (e) => identical(e.admission, admission),
          'origin capability',
          isTrue,
        ),
      ),
    );
    await port.credentialsEntered.future;
    generation++;
    port.release();
    await observed;
    expect(port.posts, isEmpty);
  });
  for (final invalidScope in [false, true]) {
    test('pre-HTTP ${invalidScope ? 'scope' : 'encoding'} terminal '
        'is known unsent', () async {
      final port = NativeDispatchPort();
      addTearDown(port.api.dispose);
      final admission = ApiMutationAdmission(
        actorId: repairActor,
        isCurrent: () => !invalidScope,
      );
      await expectLater(
        port.api.sendJsonStreamAcknowledged('POST', _path, {
          'unencodable': Object(),
        }, admission: admission),
        throwsA(
          isA<ApiMutationNotDispatched>().having(
            (e) => identical(e.admission, admission),
            'origin capability',
            isTrue,
          ),
        ),
      );
      expect(port.posts, isEmpty);
      expect(admission.definitelyNotDispatched, isTrue);
      expect(admission.recordDispatchPossible, throwsA(isA<ApiException>()));
    });
  }
  test('synchronous send invocation throw remains UNKNOWN', () async {
    final port = NativeDispatchPort();
    final client = _ThrowingClient();
    final api = ApiClient(
      authClient: port.client,
      baseUrl: 'https://fixture.test',
      httpClient: client,
    );
    addTearDown(() {
      api.dispose();
      port.api.dispose();
    });
    final admission = ApiMutationAdmission(
      actorId: repairActor,
      isCurrent: () => true,
    );
    await expectLater(
      api.sendJsonStreamAcknowledged('POST', _path, {}, admission: admission),
      throwsA(
        isA<ApiException>().having(
          (e) => e is ApiMutationNotDispatched,
          'not unsent',
          isFalse,
        ),
      ),
    );
    expect(client.calls, 1);
    expect(admission.definitelyNotDispatched, isFalse);
  });
  for (final timeout in [false, true]) {
    test(
      'post-send ${timeout ? 'timeout' : 'retirement'} remains UNKNOWN',
      () async {
        final port = NativeDispatchPort()..responseGate = Completer<void>();
        final api = ApiClient(
          authClient: port.client,
          baseUrl: 'https://fixture.test',
          httpClient: MockClient(port.handle),
          requestTimeout: timeout
              ? const Duration(milliseconds: 50)
              : const Duration(seconds: 30),
        );
        addTearDown(() {
          port.release();
          api.dispose();
          port.api.dispose();
        });
        var current = true;
        final admission = ApiMutationAdmission(
          actorId: repairActor,
          isCurrent: () => current,
        );
        final result = api.sendJsonStreamAcknowledged('POST', _path, {
          'content': 'invoked',
          'clientRequestId': repairActor,
          'attachments': <dynamic>[],
        }, admission: admission);
        final observed = expectLater(
          result,
          throwsA(
            isA<ApiException>().having(
              (e) => e is ApiMutationNotDispatched,
              'not unsent',
              isFalse,
            ),
          ),
        );
        await port.postEntered.future;
        if (!timeout) {
          current = false;
          port.release();
        }
        await observed;
        expect(port.posts, hasLength(1));
        expect(admission.definitelyNotDispatched, isFalse);
      },
    );
  }
}
