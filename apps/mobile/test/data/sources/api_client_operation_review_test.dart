import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  const actor = '33333333-3333-4333-8333-333333333333';
  const user = User(
    id: actor,
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  const path =
      '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/'
      'chat/conversations/44444444-4444-4444-8444-444444444444/reactions';
  const body = {
    'messageId': '55555555-5555-4555-8555-555555555555',
    'emoji': 'heart',
    'present': true,
    'opId': '77777777-7777-4777-8777-777777777777',
  };
  const receipt = {
    'message': {'id': '55555555-5555-4555-8555-555555555555'},
    'operation': {
      'id': '77777777-7777-4777-8777-777777777777',
      'emoji': 'heart',
      'present': true,
    },
  };
  late _Client client;
  late _Auth auth;
  late _Session session;
  setUp(() {
    client = _Client();
    auth = _Auth();
    session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-operation-fixture');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
  });
  tearDown(() => ApiVerification.requestToken = null);

  test(
    'departure during held headers is proven unsent and has no callback',
    () async {
      final preparing = Completer<void>();
      final refresh = Completer<AuthResponse>();
      when(() => session.expiresAt).thenReturn(0);
      when(() => auth.refreshSession()).thenAnswer((_) {
        preparing.complete();
        return refresh.future;
      });
      var current = true;
      var requests = 0;
      var acknowledgements = 0;
      final api = ApiClient(
        baseUrl: 'https://operation.test',
        authClient: client,
        httpClient: MockClient((_) async {
          requests++;
          return http.Response(jsonEncode(receipt), 200);
        }),
      );
      addTearDown(api.dispose);
      final admission = ApiMutationAdmission(
        actorId: actor,
        isCurrent: () => current,
      );
      final pending = api.putJsonOperationAcknowledged(
        path,
        body,
        admission: admission,
        onAcknowledged: (_) async {
          acknowledgements++;
        },
      );
      final observed = expectLater(
        pending,
        throwsA(
          isA<ApiMutationNotDispatched>().having(
            (e) => identical(e.admission, admission),
            'origin admission',
            isTrue,
          ),
        ),
      );
      await preparing.future;
      expect(requests, 0);
      current = false;
      refresh.complete(AuthResponse(session: session, user: user));
      await observed;
      expect(requests, 0);
      expect(acknowledgements, 0);
      expect(admission.definitelyNotDispatched, isTrue);
      expect(admission.recordDispatchPossible, throwsA(isA<ApiException>()));
    },
  );

  test(
    'header timeout permanently fences delayed preparation from dispatch',
    () async {
      final preparing = Completer<void>();
      final refresh = Completer<AuthResponse>();
      when(() => session.expiresAt).thenReturn(0);
      when(() => auth.refreshSession()).thenAnswer((_) {
        preparing.complete();
        return refresh.future;
      });
      var requests = 0;
      var acknowledgements = 0;
      final api = ApiClient(
        baseUrl: 'https://operation.test',
        authClient: client,
        requestTimeout: const Duration(milliseconds: 20),
        httpClient: MockClient((_) async {
          requests++;
          return http.Response(jsonEncode(receipt), 200);
        }),
      );
      addTearDown(api.dispose);
      final admission = ApiMutationAdmission(
        actorId: actor,
        isCurrent: () => true,
      );
      final pending = api.putJsonOperationAcknowledged(
        path,
        body,
        admission: admission,
        onAcknowledged: (_) async {
          acknowledgements++;
        },
      );
      final observed = expectLater(
        pending,
        throwsA(isA<ApiMutationNotDispatched>()),
      );
      await preparing.future;
      await observed;
      expect(admission.definitelyNotDispatched, isTrue);
      refresh.complete(AuthResponse(session: session, user: user));
      await Future<void>.delayed(Duration.zero);
      expect(requests, 0);
      expect(acknowledgements, 0);
    },
  );

  for (final timeout in [false, true]) {
    test(
      'origin receipt callback survives ${timeout ? 'timeout' : 'departure'} '
      'and is awaited',
      () async {
        var current = true;
        var requests = 0;
        var callbacks = 0;
        var settled = false;
        final dispatched = Completer<void>();
        final response = Completer<http.Response>();
        final callbackEntered = Completer<void>();
        final callbackRelease = Completer<void>();
        final callbackFinished = Completer<void>();
        final api = ApiClient(
          baseUrl: 'https://operation.test',
          authClient: client,
          requestTimeout: timeout
              ? const Duration(milliseconds: 20)
              : const Duration(seconds: 30),
          httpClient: MockClient((request) {
            requests++;
            expect(request.method, 'PUT');
            expect(request.url.path, path);
            expect(jsonDecode(request.body), body);
            expect(
              request.headers['authorization'],
              'Bearer synthetic-operation-fixture',
            );
            dispatched.complete();
            return response.future;
          }),
        );
        addTearDown(api.dispose);
        final admission = ApiMutationAdmission(
          actorId: actor,
          isCurrent: () => current,
        );
        final pending = api.putJsonOperationAcknowledged(
          path,
          body,
          admission: admission,
          onAcknowledged: (value) async {
            callbacks++;
            expect(value, receipt);
            callbackEntered.complete();
            await callbackRelease.future;
            callbackFinished.complete();
          },
        );
        final completion = pending.then<void>(
          (_) {
            settled = true;
          },
          onError: (Object _, StackTrace _) {
            settled = true;
          },
        );
        final observed = timeout
            ? expectLater(pending, throwsA(isA<TimeoutException>()))
            : null;
        await dispatched.future;
        current = false;
        expect(admission.current, isFalse);
        expect(admission.definitelyNotDispatched, isFalse);
        if (observed != null) {
          await observed;
          await completion;
          expect(settled, isTrue);
          expect(callbacks, 0);
        }
        response.complete(http.Response(jsonEncode(receipt), 200));
        await callbackEntered.future;
        expect(callbacks, 1);
        expect(callbackFinished.isCompleted, isFalse);
        if (!timeout) expect(settled, isFalse);
        callbackRelease.complete();
        await callbackFinished.future;
        if (!timeout) expect(await pending, receipt);
        await completion;
        expect(requests, 1);
        expect(callbacks, 1);
        expect(admission.definitelyNotDispatched, isFalse);
        verifyNever(() => auth.refreshSession());
      },
    );
  }

  for (final status in [200, 401, 403, 405, 429, 500]) {
    test(
      'operation dispatches once for HTTP $status without response replay',
      () async {
        var requests = 0;
        var callbacks = 0;
        var prompts = 0;
        ApiVerification.requestToken = () async {
          prompts++;
          return 'synthetic';
        };
        final api = ApiClient(
          baseUrl: 'https://operation.test',
          authClient: client,
          httpClient: MockClient((request) async {
            requests++;
            expect(request.method, 'PUT');
            expect(jsonDecode(request.body), body);
            return http.Response(
              jsonEncode(receipt),
              status,
              headers: status == 403 ? {'x-abuse-challenge': 'turnstile'} : {},
            );
          }),
        );
        addTearDown(api.dispose);
        final admission = ApiMutationAdmission(
          actorId: actor,
          isCurrent: () => true,
        );
        final pending = api.putJsonOperationAcknowledged(
          path,
          body,
          admission: admission,
          onAcknowledged: (_) async {
            callbacks++;
          },
        );
        if (status == 200) {
          expect(await pending, receipt);
        } else {
          await expectLater(
            pending,
            throwsA(
              isA<ApiException>().having(
                (e) => e is ApiMutationNotDispatched,
                'uncertain dispatch',
                isFalse,
              ),
            ),
          );
        }
        expect(requests, 1);
        expect(callbacks, status == 200 ? 1 : 0);
        expect(prompts, 0);
        expect(admission.definitelyNotDispatched, isFalse);
        verifyNever(() => auth.refreshSession());
      },
    );
  }

  test('unencodable body fails before dispatch and callback', () async {
    var requests = 0;
    var callbacks = 0;
    final api = ApiClient(
      baseUrl: 'https://operation.test',
      authClient: client,
      httpClient: MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      }),
    );
    addTearDown(api.dispose);
    final admission = ApiMutationAdmission(
      actorId: actor,
      isCurrent: () => true,
    );
    await expectLater(
      api.putJsonOperationAcknowledged(
        path,
        {'bad': Object()},
        admission: admission,
        onAcknowledged: (_) async {
          callbacks++;
        },
      ),
      throwsA(isA<ApiMutationNotDispatched>()),
    );
    expect(requests, 0);
    expect(callbacks, 0);
    expect(admission.definitelyNotDispatched, isTrue);
  });
}
