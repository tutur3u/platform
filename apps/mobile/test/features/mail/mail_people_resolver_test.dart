import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_people_resolver.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test(
    'deduplicates and caps addresses in an encoded workspace path',
    () async {
      final api = _Api();
      late List<String> sent;
      when(() => api.postJson(any(), any())).thenAnswer((invocation) async {
        final body = invocation.positionalArguments[1] as Map<String, dynamic>;
        sent = body['emails'] as List<String>;
        return {
          'data': [
            for (final email in sent) {'email': email, 'kind': 'unknown'},
          ],
        };
      });
      final resolver = MailPeopleResolver(
        apiClient: api,
        currentUserId: () => 'actor',
      );
      final people = await resolver.resolve('work/space', [
        ' A@example.test ',
        'a@EXAMPLE.test',
        for (var i = 0; i < 70; i++) 'person$i@example.test',
      ]);
      expect(sent, hasLength(50));
      expect(sent.first, 'a@example.test');
      expect(people['a@example.test']!['kind'], 'unknown');
      verify(
        () => api.postJson(
          '/api/v1/workspaces/work%2Fspace/people/resolve',
          any(),
        ),
      ).called(1);
      resolver.dispose();
      verifyNever(api.dispose);
    },
  );

  test('account departure discards an in-flight response', () async {
    final api = _Api();
    final response = Completer<Map<String, dynamic>>();
    var actor = 'first';
    when(() => api.postJson(any(), any())).thenAnswer((_) => response.future);
    final resolver = MailPeopleResolver(
      apiClient: api,
      currentUserId: () => actor,
    );
    final result = resolver.resolve('ws', ['a@example.test']);
    actor = 'second';
    response.complete({
      'data': [
        {'email': 'a@example.test', 'kind': 'unknown'},
      ],
    });
    await expectLater(result, throwsA(isA<ApiException>()));
  });

  test('retains explicit hidden-email policy without copying extra fields', () {
    final result = parseMailResolvedPeople(
      {
        'data': [
          {
            'email': 'a@example.test',
            'kind': 'member',
            'id': 'member',
            'emailVisible': false,
            'displayName': 'Visible name',
            'avatarUrl': null,
            'privateNote': 'must not propagate',
          },
        ],
      },
      {'a@example.test'},
    );
    expect(result['a@example.test']!['emailVisible'], isFalse);
    expect(result['a@example.test']!.containsKey('privateNote'), isFalse);
  });

  test('unknown differs from malformed, missing or unsolicited results', () {
    for (final response in <Map<String, dynamic>>[
      {},
      {'data': <Map<String, dynamic>>[]},
      {
        'data': [
          {'email': 'other@example.test', 'kind': 'unknown'},
        ],
      },
      {
        'data': [
          {'email': 'a@example.test', 'kind': 'member', 'id': 'm'},
        ],
      },
    ]) {
      expect(
        () => parseMailResolvedPeople(response, {'a@example.test'}),
        throwsFormatException,
      );
    }
  });
}
