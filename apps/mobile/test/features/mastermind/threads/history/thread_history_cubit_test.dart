import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_cubit.dart';

import '../../../../helpers/mastermind_thread_history_fixture.dart';

final _now = DateTime.utc(2026, 10, 28, 7);

ThreadHistoryCubit _cubit(FakeThreadsHub hub, {String? ref}) {
  final source = hub.source();
  final cubit = ThreadHistoryCubit(
    source: source,
    threadRef: ref ?? threadRef(1),
    clock: () => _now,
  );
  addTearDown(() async {
    await cubit.close();
    source.close();
  });
  return cubit;
}

List<Map<String, dynamic>> _messages(int from, int to) => [
  for (var i = from; i <= to; i++) messageJson(i),
];

void main() {
  test('opens on the newest page pinned to the index digest', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {
          null: pageJson(messages: _messages(31, 60), nextBefore: msgRef(31)),
        },
      ),
    );
    final cubit = _cubit(hub);
    await cubit.open();

    expect(cubit.state.phase, ThreadHistoryPhase.ready);
    expect(cubit.state.messages.first.ref, msgRef(31));
    expect(cubit.state.messages.last.ref, msgRef(60));
    expect(cubit.state.hasEarlier, isTrue);
    expect(hub.paths, [
      '/v1/threads/capabilities',
      '/v1/threads',
      '/v1/threads/${threadRef(1)}/messages',
    ]);
    expect(hub.requests.last.url.queryParameters, {
      'digest': digestOf('a'),
      'limit': '30',
    });
    expect(hub.requests.last.headers['Authorization'], 'Bearer token-1');
  });

  test('pages backwards on the same digest and prepends once', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {
          null: pageJson(messages: _messages(31, 60), nextBefore: msgRef(31)),
          // The hub may repeat the boundary message; it shows once.
          msgRef(31): pageJson(messages: _messages(1, 31)),
        },
      ),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    await cubit.loadEarlier();

    expect(hub.requests.last.url.queryParameters, {
      'digest': digestOf('a'),
      'before': msgRef(31),
      'limit': '30',
    });
    expect(cubit.state.messages, hasLength(60));
    expect(cubit.state.messages.first.ref, msgRef(1));
    expect(cubit.state.messages.last.ref, msgRef(60));
    expect(cubit.state.hasEarlier, isFalse);
  });

  test('a smaller hub page limit wins', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        caps: capsJson(pageMax: 10),
        pages: {null: pageJson(messages: _messages(1, 10))},
      ),
    );
    await _cubit(hub).open();
    expect(hub.requests.last.url.queryParameters['limit'], '10');
  });

  test('410 on an older page reloads the index and re-pins', () async {
    var digest = 'a';
    http.Response handle(http.Request request) {
      final path = request.url.path;
      final query = request.url.queryParameters;
      if (path.endsWith('/capabilities')) {
        return http.Response.bytes(jsonBytes(capsJson()), 200);
      }
      if (path == '/v1/threads') {
        return http.Response.bytes(
          jsonBytes(indexJson([indexRow(digest: digestOf(digest))])),
          200,
        );
      }
      if (query['digest'] != digestOf(digest)) {
        return http.Response('{"error":"digest_gone"}', 410);
      }
      return http.Response.bytes(
        jsonBytes(
          pageJson(
            digest: digestOf(digest),
            messages: digest == 'a' ? _messages(31, 60) : _messages(41, 70),
            nextBefore: digest == 'a' ? msgRef(31) : msgRef(41),
          ),
        ),
        200,
      );
    }

    final hub = FakeThreadsHub(handle);
    final cubit = _cubit(hub);
    await cubit.open();
    digest = 'b';
    await cubit.loadEarlier();

    expect(cubit.state.phase, ThreadHistoryPhase.ready);
    expect(cubit.state.updated, isTrue);
    expect(cubit.state.thread?.digest, digestOf('b'));
    expect(cubit.state.messages.last.ref, msgRef(70));
    expect(hub.requests.last.url.queryParameters['digest'], digestOf('b'));
  });

  test('a 410 right after a fresh index does not loop', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {null: http.Response('{"error":"digest_gone"}', 410)},
      ),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    expect(cubit.state.phase, ThreadHistoryPhase.failed);
    expect(cubit.state.problem, ThreadsProblem.unavailable);
    expect(hub.requests, hasLength(3));
  });

  test('a page for another digest is refused as drift', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(pages: {null: pageJson(digest: digestOf('c'))}),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    expect(cubit.state.problem, ThreadsProblem.unavailable);
  });

  test('429 says when to try again and keeps messages on screen', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {
          null: pageJson(messages: _messages(31, 60), nextBefore: msgRef(31)),
          msgRef(31): http.Response(
            '{"error":"rate_limited"}',
            429,
            headers: {'retry-after': '120'},
          ),
        },
      ),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    await cubit.loadEarlier();
    expect(cubit.state.phase, ThreadHistoryPhase.ready);
    expect(cubit.state.messages, hasLength(30));
    expect(cubit.state.problem, ThreadsProblem.rateLimited);
    expect(cubit.state.retryAt, _now.add(const Duration(minutes: 2)));
  });

  group('not available on mobile', () {
    Future<ThreadHistoryState> open(FakeThreadsHub hub, {String? ref}) async {
      final cubit = _cubit(hub, ref: ref);
      await cubit.open();
      return cubit.state;
    }

    test('404 from the hub', () async {
      final state = await open(FakeThreadsHub(FakeThreadsHub.serving()));
      expect(state.problem, ThreadsProblem.notAvailable);
    });

    test('a none-tier thread never asks for messages', () async {
      final hub = FakeThreadsHub(
        FakeThreadsHub.serving(index: indexJson([indexRow(history: 'none')])),
      );
      final state = await open(hub);
      expect(state.problem, ThreadsProblem.notAvailable);
      expect(hub.paths.where((p) => p.endsWith('/messages')), isEmpty);
    });

    test('a ref missing from the index', () async {
      final state = await open(
        FakeThreadsHub(FakeThreadsHub.serving()),
        ref: threadRef(9),
      );
      expect(state.problem, ThreadsProblem.notAvailable);
    });

    test('a malformed ref makes no request', () async {
      final hub = FakeThreadsHub(FakeThreadsHub.serving());
      final state = await open(hub, ref: '..%2Fsnapshot');
      expect(state.problem, ThreadsProblem.notAvailable);
      expect(hub.requests, isEmpty);
    });

    test('read off, or the kill switch', () async {
      expect(
        (await open(
          FakeThreadsHub(FakeThreadsHub.serving(caps: capsJson(read: false))),
        )).problem,
        ThreadsProblem.notAvailable,
      );
      expect(
        (await open(
          FakeThreadsHub(
            (_) => http.Response('{"error":"threads_disabled"}', 403),
          ),
        )).problem,
        ThreadsProblem.notAvailable,
      );
    });
  });

  test('401 refreshes the session once, then reads', () async {
    final tokens = FakeThreadTokens();
    final hub = FakeThreadsHub(
      (request) => request.headers['Authorization'] == 'Bearer token-1'
          ? http.Response('{"error":"unauthorized"}', 401)
          : FakeThreadsHub.serving(
              pages: {null: pageJson(messages: _messages(1, 2))},
            )(request),
      tokens: tokens,
    );
    final cubit = _cubit(hub);
    await cubit.open();
    expect(cubit.state.phase, ThreadHistoryPhase.ready);
    expect(tokens.refreshes, 1);
  });

  test('403 without a grant is lost access', () async {
    final hub = FakeThreadsHub(
      (_) => http.Response('{"error":"no_grant"}', 403),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    expect(cubit.state.problem, ThreadsProblem.accessLost);
  });

  test('an oversized page is refused', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {null: http.Response.bytes(List.filled(300 * 1024, 0x20), 200)},
      ),
    );
    final cubit = _cubit(hub);
    await cubit.open();
    expect(cubit.state.problem, ThreadsProblem.unavailable);
  });

  test('hide drops everything and ignores a read in flight', () async {
    final hub = FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {null: pageJson(messages: _messages(1, 3))},
      ),
    );
    final cubit = _cubit(hub);
    final opening = cubit.open();
    cubit.hide();
    await opening;
    expect(cubit.state.phase, ThreadHistoryPhase.hidden);
    expect(cubit.state.messages, isEmpty);

    await cubit.open();
    expect(cubit.state.messages, hasLength(3));
    cubit.hide();
    expect(cubit.state.messages, isEmpty);
  });
}
