import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/threads/threads_cubit.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';
import 'package:mobile/features/mastermind/threads/threads_repository.dart';

class Tokens implements AccessTokenProvider {
  @override
  Future<String?> currentAccessToken() async => 'test-token';
  @override
  Future<String?> refreshAccessToken() async => 'test-token';
}

Map<String, dynamic> entry() => {
  'thread_ref': 'item-01234567890123456789',
  'title': '[Atlas] Mastermind',
  'role': 'Mastermind',
  'product': 'Tuturuuu',
  'state': 'waiting',
  'history': 'redacted',
  'history_digest': 'digest',
  'preview': '‹path›',
};
ThreadsRepository repo(Future<http.Response> Function(http.Request) handler) =>
    ThreadsRepository(
      base: Uri.parse('https://hub.example'),
      tokens: Tokens(),
      client: MockClient(handler),
    );

void main() {
  test('feature defaults off', () => expect(mastermindThreadsEnabled, isFalse));
  test(
    'tolerant fields and grouped filters search friendly title role product',
    () {
      final t = ThreadEntry.fromJson(entry()..['extra'] = true);
      expect(t.matches('atlas', 'waiting'), isTrue);
      expect(t.matches('tuturuuu', null), isTrue);
      expect(t.matches('atlas', 'running'), isFalse);
      expect(ThreadEntry.fromJson({}).title, '');
      expect(
        ThreadEntry.fromJson(entry()..['state'] = 'queued').group,
        'running',
      );
      expect(
        ThreadEntry.fromJson(entry()..['state'] = 'completed').group,
        'idle',
      );
    },
  );
  test(
    'capabilities 404 falls back without index or old capabilities request',
    () async {
      final paths = <String>[];
      final r = repo((request) async {
        paths.add(request.url.path);
        return http.Response('', 404);
      });
      final c = ThreadsCubit(r);
      await c.refresh();
      expect(c.state.status, ThreadsStatus.fallback);
      expect(paths, ['/v1/threads/capabilities']);
      await c.close();
      r.close();
    },
  );
  test('read false falls back', () async {
    final r = repo(
      (_) async => http.Response('{"schema":"threads-1","read":false}', 200),
    );
    final c = ThreadsCubit(r);
    await c.refresh();
    expect(c.state.status, ThreadsStatus.fallback);
    await c.close();
    r.close();
  });
  test('index cached on rate limit, no automatic retry', () async {
    var limited = false;
    var calls = 0;
    final r = repo((request) async {
      calls++;
      if (request.url.path.endsWith('capabilities')) {
        return http.Response('{"schema":"threads-1","read":true}', 200);
      }
      if (limited) {
        return http.Response('', 429, headers: {'retry-after': '60'});
      }
      return http.Response(
        jsonEncode({
          'schema': 'threads-1',
          'threads': [entry()],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final c = ThreadsCubit(r);
    await c.refresh();
    limited = true;
    await c.refresh();
    expect(c.state.entries.single.title, '[Atlas] Mastermind');
    expect(c.state.failure?.status, 429);
    expect(c.state.failure?.retryAt, isNotNull);
    expect(calls, 4);
    await c.close();
    r.close();
  });
  test(
    'history pins digest, cursor and 30 message limit; caches last page',
    () async {
      final r = repo((request) async {
        expect(request.headers['Authorization'], 'Bearer test-token');
        expect(request.url.queryParameters, {
          'digest': 'digest',
          'before': 'm-earlier',
          'limit': '30',
        });
        return http.Response(
          jsonEncode({
            'history_digest': 'digest',
            'more': true,
            'next_before': 'm-next',
            'messages': [
              {
                'msg_ref': 'm-1',
                'author_label': 'Atlas',
                'text': '‹path›',
                'withheld': false,
                'truncated': true,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final t = ThreadEntry.fromJson(entry());
      final p = await r.history(t, before: 'm-earlier');
      expect(p.messages.single.text, '‹path›');
      expect(p.more, isTrue);
      expect(p.before, 'm-next');
      expect(r.pages[t.ref], same(p));
      r.close();
    },
  );
  test('410 and hidden 404 retain typed safe failures', () async {
    for (final status in [410, 404, 429]) {
      var calls = 0;
      final r = repo((_) async {
        calls++;
        return http.Response('private error body', status);
      });
      await expectLater(
        r.history(ThreadEntry.fromJson(entry())),
        throwsA(
          isA<ThreadsFailure>().having((e) => e.status, 'status', status),
        ),
      );
      expect(calls, 1);
      r.close();
    }
  });
}
