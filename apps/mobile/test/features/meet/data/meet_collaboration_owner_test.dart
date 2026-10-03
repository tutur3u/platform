import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/meet/data/meet_collaboration_owner.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  for (final mutate in [false, true]) {
    test(
      'admitted A cannot send ${mutate ? 'mutation' : 'read'} as B',
      () async {
        final client = _Client();
        final auth = _Auth();
        final session = _Session();
        const userA = User(
          id: 'actor-a',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01',
        );
        const userB = User(
          id: 'actor-b',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01',
        );
        var current = userA;
        when(() => client.auth).thenReturn(auth);
        when(() => auth.currentUser).thenAnswer((_) => current);
        when(() => auth.currentSession).thenReturn(session);
        when(() => session.accessToken).thenReturn('synthetic-session');
        when(() => session.expiresAt).thenReturn(
          DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
              1000,
        );
        var sent = 0;
        final api = ApiClient(
          baseUrl: 'https://example.test',
          authClient: client,
          httpClient: MockClient((_) async {
            sent++;
            return http.Response('{"ok":true}', 200);
          }),
        );
        final owner = MeetCollaborationOwner(
          userId: current.id,
          currentUserId: () => auth.currentUser?.id,
          isAdmitted: () => true,
        );
        Future<Map<String, dynamic>> request() => owner.run(
          () => mutate
              ? api.postJson('/collaboration', {'action': 'run'})
              : api.getJson('/collaboration?action=document'),
        );
        try {
          expect(await request(), {'ok': true});
          current = userB;
          await expectLater(
            request(),
            throwsA(
              isA<ApiException>().having((e) => e.statusCode, 'status', 401),
            ),
          );
          expect(sent, 1);
        } finally {
          api.dispose();
        }
      },
    );
  }

  test('late bridge result cannot cross account or admission change', () async {
    for (final accountChanged in [true, false]) {
      String? current = 'actor-a';
      var admitted = true;
      final owner = MeetCollaborationOwner(
        userId: current,
        currentUserId: () => current,
        isAdmitted: () => admitted,
      );
      final pending = Completer<String>();
      final result = owner.run(() => pending.future);
      final rejected = expectLater(result, throwsA(isA<ApiException>()));
      if (accountChanged) {
        current = 'actor-b';
      } else {
        admitted = false;
      }
      pending.complete('private-document');
      await rejected;
    }
  });

  test(
    'unknown admitted actor fails closed before invoking a request',
    () async {
      var invoked = false;
      final owner = MeetCollaborationOwner(
        userId: null,
        currentUserId: () => 'actor-a',
        isAdmitted: () => true,
      );
      await expectLater(
        owner.run(() async {
          invoked = true;
          return 'private-document';
        }),
        throwsA(isA<ApiException>()),
      );
      expect(invoked, isFalse);
    },
  );
}
