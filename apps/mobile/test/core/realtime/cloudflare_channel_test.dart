import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/realtime/cloudflare_channel.dart';

void main() {
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
