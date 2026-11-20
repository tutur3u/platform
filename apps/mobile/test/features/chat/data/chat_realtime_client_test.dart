import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';

void main() {
  test('reconnect delay doubles from 1s to 30s in the upper half', () {
    expect(
      chatRealtimeReconnectDelay(1, 1),
      const Duration(milliseconds: 1000),
    );
    expect(chatRealtimeReconnectDelay(1, 0), const Duration(milliseconds: 500));
    expect(
      chatRealtimeReconnectDelay(2, 1),
      const Duration(milliseconds: 2000),
    );
    expect(
      chatRealtimeReconnectDelay(3, 1),
      const Duration(milliseconds: 4000),
    );
    expect(
      chatRealtimeReconnectDelay(4, 1),
      const Duration(milliseconds: 8000),
    );
    expect(
      chatRealtimeReconnectDelay(5, 1),
      const Duration(milliseconds: 16000),
    );
    expect(
      chatRealtimeReconnectDelay(20, 1),
      const Duration(milliseconds: 30000),
    );
  });

  test('enabled false keeps the SSE fallback', () async {
    final client = _client(
      ticket: (_, {conversationId}) async => {'enabled': false},
    );
    final events = await _take(client.connect('workspace'), 1);
    expect(events.single, isA<ChatRealtimeErrorEvent>());
    expect(
      (events.single as ChatRealtimeErrorEvent).message,
      'Realtime disabled',
    );
    client.dispose();
  });

  test('ticket failures back off, then wait for retry', () async {
    final waits = <Completer<void>>[];
    var opens = 0;
    final client = _client(
      ticket: (_, {conversationId}) async => {
        'enabled': true,
        'ticket': 'tok',
        'url': 'ws://127.0.0.1:9/v1/connect',
      },
      openSocket: (_, _) async {
        opens += 1;
        throw StateError('down');
      },
      wait: (delay) {
        final gate = Completer<void>();
        waits.add(gate);
        return gate.future;
      },
    );
    final events = <ChatRealtimeEvent>[];
    final subscription = client.connect('workspace').listen(events.add);

    for (var attempt = 0; attempt < 4; attempt++) {
      await _until(() => waits.length == attempt + 1);
      waits[attempt].complete();
    }
    await _until(() => events.whereType<ChatRealtimeErrorEvent>().length == 1);
    expect(opens, 5);
    expect(waits, hasLength(4));

    client.retry();
    await _until(() => events.whereType<ChatRealtimeErrorEvent>().length == 2);
    expect(opens, 6);
    expect(waits, hasLength(4));

    await subscription.cancel();
    client.dispose();
  });

  test('replays since after expiry and refetches id-only frames', () async {
    final sockets = <_ScriptedSocket>[];
    final client = _client(
      ticket: (_, {conversationId}) async => {
        'enabled': true,
        'ticket': 'tok',
        'url': 'ws://127.0.0.1:9/v1/connect',
      },
      openSocket: (url, protocols) async {
        final socket = _ScriptedSocket(url, protocols);
        sockets.add(socket);
        return socket.live;
      },
    );
    final events = <ChatRealtimeEvent>[];
    final subscription = client.connect('workspace').listen(events.add);

    await _until(() => sockets.length == 1);
    expect(sockets.single.protocols, [chatRealtimeSubprotocol, 'ticket.tok']);
    sockets.single.add({'t': 'ready', 'seq': 3, 'userId': 'self'});
    sockets.single.add({
      't': 'event',
      'seq': 4,
      'event': {
        'type': 'message.created',
        'message': {'id': 'message-1'},
      },
    });
    sockets.single.add({'t': 'typing', 'on': true, 'userId': 'self'});
    sockets.single.add({'t': 'typing', 'on': true, 'userId': 'peer'});
    await _until(() => events.whereType<ChatRealtimeResyncEvent>().length == 2);
    expect(events.whereType<ChatRealtimeMessageEvent>(), isEmpty);
    expect(events.whereType<ChatRealtimeTypingEvent>(), isEmpty);

    sockets.single.code = chatRealtimeCloseExpired;
    await sockets.single.finish();
    await _until(() => sockets.length == 2);
    expect(sockets[1].url.queryParameters['since'], '4');

    sockets[1].add({
      't': 'event',
      'seq': 5,
      'event': {
        'type': 'message.created',
        'message': {
          'id': 'message-2',
          'conversationId': '11111111-1111-4111-8111-111111111111',
          'content': 'hello',
          'kind': 'user',
          'createdAt': '2026-11-20T00:00:00.000Z',
        },
      },
    });
    await _until(() => events.whereType<ChatRealtimeMessageEvent>().isNotEmpty);
    expect(
      events.whereType<ChatRealtimeMessageEvent>().single.message.id,
      'message-2',
    );

    await subscription.cancel();
    client.dispose();
  });
}

ChatRealtimeClient _client({
  required ChatRealtimeTicketLoader ticket,
  ChatRealtimeSocketOpener? openSocket,
  Future<void> Function(Duration delay)? wait,
}) {
  return ChatRealtimeClient(
    loadTicket: ticket,
    openSocket: openSocket,
    wait: wait,
    random: () => 1,
    watchForeground: false,
  );
}

Future<List<ChatRealtimeEvent>> _take(
  Stream<ChatRealtimeEvent> stream,
  int count,
) async {
  final events = <ChatRealtimeEvent>[];
  final done = Completer<void>();
  final subscription = stream.listen((event) {
    events.add(event);
    if (events.length >= count && !done.isCompleted) done.complete();
  });
  await done.future.timeout(const Duration(seconds: 2));
  await subscription.cancel();
  return events;
}

Future<void> _until(bool Function() done) async {
  for (var attempt = 0; attempt < 50 && !done(); attempt++) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(done(), isTrue);
}

class _ScriptedSocket {
  _ScriptedSocket(this.url, this.protocols);

  final Uri url;
  final List<String> protocols;
  final StreamController<dynamic> _messages = StreamController<dynamic>();
  int? code;

  ChatRealtimeLiveSocket get live => ChatRealtimeLiveSocket(
    messages: _messages.stream,
    close: () async {
      if (!_messages.isClosed) await _messages.close();
    },
    closeCode: () => code,
  );

  void add(Map<String, Object?> frame) {
    _messages.add(jsonEncode(frame));
  }

  Future<void> finish() => _messages.close();
}
