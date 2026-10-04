import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/realtime/cloudflare_channel.dart';
import 'package:mocktail/mocktail.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class _Channel extends Mock implements WebSocketChannel {}

class _Sink extends Mock implements WebSocketSink {}

void main() {
  test(
    'one-shot ticket denial preserves original error without retry',
    () async {
      final denied = StateError('ticket denied');
      var attempts = 0;
      final channel = CloudflareChannel(
        resolveTicket: () async {
          attempts++;
          throw denied;
        },
        onMessage: (_) {},
      );
      try {
        await expectLater(
          channel.connect(retryOnFailure: false),
          throwsA(same(denied)),
        );
        await Future<void>.delayed(const Duration(milliseconds: 600));
        expect(attempts, 1);
      } finally {
        await channel.close();
      }
    },
  );
  test(
    'one-shot handshake failure closes socket and preserves cause',
    () async {
      final socket = _Channel();
      final sink = _Sink();
      final failed = StateError('handshake failed');
      var attempts = 0;
      when(() => socket.ready).thenAnswer((_) async => throw failed);
      when(() => socket.sink).thenReturn(sink);
      when(sink.close).thenAnswer((_) async {});
      final channel = CloudflareChannel(
        resolveTicket: () async {
          attempts++;
          return {
            'endpoint': 'wss://example.test/channels',
            'token': 'synthetic',
          };
        },
        connectSocket: (_) => socket,
        onMessage: (_) {},
      );
      try {
        await expectLater(
          channel.connect(retryOnFailure: false),
          throwsA(same(failed)),
        );
        verify(sink.close).called(1);
        await Future<void>.delayed(const Duration(milliseconds: 600));
        expect(attempts, 1);
      } finally {
        await channel.close();
      }
    },
  );

  test(
    'closing during old socket cleanup never resumes authorization',
    () async {
      final old = _Channel();
      final next = _Channel();
      final oldSink = _Sink();
      final nextSink = _Sink();
      final oldStream = StreamController<dynamic>();
      final nextStream = StreamController<dynamic>();
      final cleanupStarted = Completer<void>();
      final cleanup = Completer<void>();
      when(() => old.ready).thenAnswer((_) async {});
      when(() => next.ready).thenAnswer((_) async {});
      when(() => old.stream).thenAnswer((_) => oldStream.stream);
      when(() => next.stream).thenAnswer((_) => nextStream.stream);
      when(() => old.sink).thenReturn(oldSink);
      when(() => next.sink).thenReturn(nextSink);
      when(oldSink.close).thenAnswer((_) {
        if (!cleanupStarted.isCompleted) cleanupStarted.complete();
        return cleanup.future;
      });
      when(nextSink.close).thenAnswer((_) async {});
      var tickets = 0;
      var connections = 0;
      final channel = CloudflareChannel(
        refreshInterval: const Duration(milliseconds: 40),
        resolveTicket: () async => {
          'endpoint': 'wss://example.test/channels',
          'token': 'ticket-${++tickets}',
        },
        connectSocket: (_) => connections++ == 0 ? old : next,
        onMessage: (_) {},
      );
      try {
        await channel.connect();
        final reconnecting = channel.connect();
        await cleanupStarted.future.timeout(const Duration(seconds: 2));
        await channel.close();
        cleanup.complete();
        await reconnecting;
        await Future<void>.delayed(const Duration(milliseconds: 100));
        expect(tickets, 2);
        expect(connections, 2);
        verify(nextSink.close).called(1);
      } finally {
        if (!cleanup.isCompleted) cleanup.complete();
        await channel.close();
        await oldStream.close();
        await nextStream.close();
      }
    },
  );
  test(
    'reauthorizes reconnects, sends frames, and closes subscriptions',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final peers = <WebSocket>[];
      final tokens = <String?>[];
      final first = Completer<WebSocket>();
      final reconnected = Completer<WebSocket>();
      final received = Completer<Map<String, dynamic>>();
      final subscription = server.listen((request) async {
        tokens.add(request.uri.queryParameters['token']);
        final socket = await WebSocketTransformer.upgrade(request);
        peers.add(socket);
        socket.listen((dynamic raw) {
          if (!received.isCompleted) {
            received.complete(
              jsonDecode(raw as String) as Map<String, dynamic>,
            );
          }
        });
        if (!first.isCompleted) {
          first.complete(socket);
        } else if (!reconnected.isCompleted) {
          reconnected.complete(socket);
        }
      });
      var tickets = 0;
      final message = Completer<Map<String, dynamic>>();
      final channel = CloudflareChannel(
        resolveTicket: () async => {
          'endpoint': 'ws://127.0.0.1:${server.port}/channels',
          'token': 'ticket-${++tickets}',
        },
        onMessage: (value) {
          if (!message.isCompleted) message.complete(value);
        },
      );
      try {
        await channel.connect();
        final peer = await first.future.timeout(const Duration(seconds: 5));
        await channel.send({
          'type': 'broadcast',
          'event': 'task:upsert',
          'payload': {'id': 'task'},
        });
        expect(
          (await received.future.timeout(const Duration(seconds: 5)))['event'],
          'task:upsert',
        );
        peer
          ..add('malformed')
          ..add(
            jsonEncode({
              'type': 'broadcast',
              'event': 'task:delete',
              'payload': {'id': 'task'},
            }),
          );
        expect(
          (await message.future.timeout(const Duration(seconds: 5)))['event'],
          'task:delete',
        );
        await peer.close();
        await reconnected.future.timeout(const Duration(seconds: 5));
        expect(tokens, ['ticket-1', 'ticket-2']);
        await channel.close();
        await Future<void>.delayed(const Duration(milliseconds: 650));
        expect(tickets, 2);
        await expectLater(channel.send({'event': 'late'}), throwsStateError);
      } finally {
        await channel.close();
        for (final peer in peers) {
          await peer.close();
        }
        await subscription.cancel();
        await server.close(force: true);
      }
    },
  );
  test(
    'refreshes authorization on the same socket without replaying snapshots',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final peers = <WebSocket>[];
      final refreshed = Completer<Map<String, dynamic>>();
      final subscription = server.listen((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        peers.add(socket);
        socket.listen((dynamic raw) {
          final frame = jsonDecode(raw as String) as Map<String, dynamic>;
          if (!refreshed.isCompleted) refreshed.complete(frame);
        });
      });
      var tickets = 0;
      final channel = CloudflareChannel(
        refreshInterval: const Duration(milliseconds: 50),
        resolveTicket: () async => {
          'endpoint': 'ws://127.0.0.1:${server.port}/channels',
          'token': 'ticket-${++tickets}',
        },
        onMessage: (_) {},
      );
      try {
        await channel.connect();
        expect(await refreshed.future.timeout(const Duration(seconds: 5)), {
          'type': 'authenticate',
          'token': 'ticket-2',
        });
        expect(peers, hasLength(1));
        await channel.close();
        final count = tickets;
        await Future<void>.delayed(const Duration(milliseconds: 100));
        expect(tickets, count);
      } finally {
        await channel.close();
        for (final peer in peers) {
          await peer.close();
        }
        await subscription.cancel();
        await server.close(force: true);
      }
    },
  );
  test(
    'replays presence after reconnect and stops replaying after untrack',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final peers = <WebSocket>[];
      final frames = <List<Map<String, dynamic>>>[];
      final subscription = server.listen((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        final received = <Map<String, dynamic>>[];
        peers.add(socket);
        frames.add(received);
        socket.listen(
          (dynamic raw) =>
              received.add(jsonDecode(raw as String) as Map<String, dynamic>),
        );
      });
      final channel = CloudflareChannel(
        resolveTicket: () async => {
          'endpoint': 'ws://127.0.0.1:${server.port}/channels',
          'token': 'fixture',
        },
        onMessage: (_) {},
      );
      Future<void> until(bool Function() condition) async {
        final deadline = DateTime.now().add(const Duration(seconds: 5));
        while (!condition() && DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
        expect(condition(), isTrue);
      }

      try {
        await channel.connect();
        await until(() => peers.length == 1);
        await channel.send({
          'type': 'track',
          'payload': {'file': 'main.py', 'cursor': 2},
        });
        await until(() => frames.first.isNotEmpty);
        await peers.first.close();
        await until(() => frames.length == 2 && frames[1].isNotEmpty);
        expect(frames[1].single, frames.first.single);
        await channel.send({'type': 'untrack'});
        await until(() => frames[1].length == 2);
        await peers[1].close();
        await until(() => peers.length == 3);
        await Future<void>.delayed(const Duration(milliseconds: 100));
        expect(frames[2], isEmpty);
      } finally {
        await channel.close();
        for (final peer in peers) {
          await peer.close();
        }
        await subscription.cancel();
        await server.close(force: true);
      }
    },
  );
  test(
    'refresh cleanup failure still reconnects with a fresh ticket',
    () async {
      final first = _Channel();
      final second = _Channel();
      final broken = _Sink();
      final healthy = _Sink();
      final firstStream = StreamController<dynamic>.broadcast();
      final secondStream = StreamController<dynamic>.broadcast();
      when(() => first.ready).thenAnswer((_) async {});
      when(() => second.ready).thenAnswer((_) async {});
      when(() => first.stream).thenAnswer((_) => firstStream.stream);
      when(() => second.stream).thenAnswer((_) => secondStream.stream);
      when(() => first.sink).thenReturn(broken);
      when(() => second.sink).thenReturn(healthy);
      when(
        broken.close,
      ).thenAnswer((_) async => throw StateError('close failed'));
      when(healthy.close).thenAnswer((_) async {});
      var tickets = 0;
      var sockets = 0;
      final reconnected = Completer<void>();
      final channel = CloudflareChannel(
        refreshInterval: const Duration(milliseconds: 20),
        resolveTicket: () async {
          if (++tickets == 2) throw StateError('refresh denied');
          return {
            'endpoint': 'wss://example.test/channels',
            'token': 'ticket-$tickets',
          };
        },
        connectSocket: (_) {
          if (++sockets == 1) return first;
          if (!reconnected.isCompleted) reconnected.complete();
          return second;
        },
        onMessage: (_) {},
      );
      try {
        await channel.connect();
        await reconnected.future.timeout(const Duration(seconds: 2));
        expect(tickets, greaterThanOrEqualTo(3));
        expect(sockets, 2);
      } finally {
        await channel.close();
        await firstStream.close();
        await secondStream.close();
      }
    },
  );
  test('closing while refresh cleanup is pending fences reconnect', () async {
    final socket = _Channel();
    final sink = _Sink();
    final stream = StreamController<dynamic>.broadcast();
    final started = Completer<void>();
    final cleanup = Completer<void>();
    when(() => socket.ready).thenAnswer((_) async {});
    when(() => socket.stream).thenAnswer((_) => stream.stream);
    when(() => socket.sink).thenReturn(sink);
    when(sink.close).thenAnswer((_) {
      if (!started.isCompleted) started.complete();
      return cleanup.future;
    });
    var tickets = 0;
    final channel = CloudflareChannel(
      refreshInterval: const Duration(milliseconds: 20),
      resolveTicket: () async {
        if (++tickets > 1) throw StateError('refresh denied');
        return {'endpoint': 'wss://example.test/channels', 'token': 'initial'};
      },
      connectSocket: (_) => socket,
      onMessage: (_) {},
    );
    try {
      await channel.connect();
      await started.future.timeout(const Duration(seconds: 2));
      final closing = channel.close();
      cleanup.complete();
      await closing;
      await Future<void>.delayed(const Duration(milliseconds: 650));
      expect(tickets, 2);
    } finally {
      if (!cleanup.isCompleted) cleanup.complete();
      await channel.close();
      await stream.close();
    }
  });
  test('never sends a ticket to an insecure external endpoint', () async {
    var connections = 0;
    final channel = CloudflareChannel(
      resolveTicket: () async => {
        'endpoint': 'ws://external.example/channels',
        'token': 'fixture',
      },
      connectSocket: (_) {
        connections++;
        throw StateError('must not connect');
      },
      onMessage: (_) {},
    );
    await channel.connect();
    expect(connections, 0);
    await channel.close();
  });
}
