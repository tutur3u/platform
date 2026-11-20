part of 'chat_realtime_client.dart';

const chatRealtimeSubprotocol = 'tuturuuu.chat.v1';
const _ticketPrefix = 'ticket.';
const chatRealtimeCloseExpired = 4001;
const chatRealtimeCloseRemoved = 4003;
const _maxFailures = 5;

/// Full jitter in the upper half of a delay that doubles from 1 s to 30 s.
Duration chatRealtimeReconnectDelay(int failures, double random) {
  final exponent = (failures - 1).clamp(0, 10);
  final ceiling = min(30000, 1000 * pow(2, exponent).toInt());
  final unit = random.clamp(0, 1).toDouble();
  return Duration(milliseconds: (ceiling / 2 + ceiling / 2 * unit).round());
}

typedef ChatRealtimeSocketOpener =
    Future<ChatRealtimeLiveSocket> Function(Uri url, List<String> protocols);

class ChatRealtimeLiveSocket {
  ChatRealtimeLiveSocket({
    required this.messages,
    required this.close,
    this.closeCode,
  });

  final Stream<dynamic> messages;
  final Future<void> Function() close;
  final int? Function()? closeCode;
}

Future<ChatRealtimeLiveSocket> _defaultOpenSocket(
  Uri url,
  List<String> protocols,
) async {
  final socket = await WebSocket.connect(url.toString(), protocols: protocols);
  return ChatRealtimeLiveSocket(
    messages: socket,
    // WebSocket.close has optional parameters, so it is not a tearoff.
    // ignore: unnecessary_lambdas
    close: () => socket.close(),
    closeCode: () => socket.closeCode,
  );
}

class _SocketStop {
  const _SocketStop({
    required this.opened,
    required this.since,
    required this.code,
  });

  final bool opened;
  final int? since;
  final int? code;
}

class _ChatRealtimeRun {
  _ChatRealtimeRun({
    required this.client,
    required this.controller,
    required this.wsId,
    required this.conversationId,
  });

  final ChatRealtimeClient client;
  final StreamController<ChatRealtimeEvent> controller;
  final String wsId;
  final String? conversationId;
  bool _stopped = false;
  Completer<void>? _retryGate;
  Completer<void>? _legacyDone;
  StreamSubscription<ChatRealtimeEvent>? _legacySub;
  ChatRealtimeLiveSocket? _socket;

  void stop() => close();

  void close() {
    _stopped = true;
    _releaseRetry();
    final done = _legacyDone;
    unawaited(
      (_legacySub?.cancel() ?? Future<void>.value()).whenComplete(() {
        if (done != null && !done.isCompleted) done.complete();
      }),
    );
    _legacySub = null;
    final socket = _socket;
    _socket = null;
    if (socket != null) unawaited(socket.close());
  }

  void retry() {
    _releaseRetry();
  }

  void _releaseRetry() {
    final gate = _retryGate;
    if (gate != null && !gate.isCompleted) gate.complete();
  }

  void _emit(ChatRealtimeEvent event) {
    if (!_stopped && !controller.isClosed) controller.add(event);
  }

  Future<void> start() async {
    var failures = 0;
    int? since;
    while (!_stopped && !client._disposed) {
      Map<String, dynamic>? ticket;
      try {
        ticket = await client._ticket(wsId, conversationId: conversationId);
      } on Object {
        ticket = null;
      }
      if (_stopped || client._disposed) return;
      if (ticket == null || ticket['enabled'] != true) {
        if (ticket != null && ticket['enabled'] == false) {
          final done = Completer<void>();
          _legacyDone = done;
          _legacySub = client
              ._legacy(wsId)
              .listen(
                _emit,
                onDone: () {
                  if (!done.isCompleted) done.complete();
                },
                onError: (_, _) {
                  if (!done.isCompleted) done.complete();
                },
              );
          await done.future;
          return;
        }
        failures = await _fail(failures);
        continue;
      }

      final url = ticket['url']?.toString();
      final token = ticket['ticket']?.toString();
      if (url == null || token == null || url.isEmpty || token.isEmpty) {
        failures = await _fail(failures);
        continue;
      }

      final end = await _pump(url, token, since);
      since = end.since ?? since;
      if (_stopped || client._disposed) return;
      if (end.opened) failures = 0;
      if (end.code == chatRealtimeCloseRemoved) {
        _emit(const ChatRealtimeResyncEvent());
        return;
      }
      if (end.code == chatRealtimeCloseExpired && end.opened) continue;
      failures = await _fail(failures);
    }
  }

  /// Counts one failed attempt. After five, waits for [retry] and leaves the
  /// count one below the limit so the next miss returns to polling.
  Future<int> _fail(int failures) async {
    final next = failures + 1;
    if (next >= _maxFailures) {
      _emit(const ChatRealtimeErrorEvent('Realtime unavailable'));
      final gate = Completer<void>();
      _retryGate = gate;
      await gate.future;
      _retryGate = null;
      return _maxFailures - 1;
    }
    await client._wait(chatRealtimeReconnectDelay(next, client._random()));
    return next;
  }

  Future<_SocketStop> _pump(String url, String token, int? since) async {
    final uri = _withSince(url, since);
    ChatRealtimeLiveSocket? socket;
    try {
      socket = await client._openSocket(uri, [
        chatRealtimeSubprotocol,
        '$_ticketPrefix$token',
      ]);
    } on Object {
      return _SocketStop(opened: false, since: since, code: null);
    }
    if (_stopped || client._disposed) {
      await socket.close();
      return const _SocketStop(opened: false, since: null, code: null);
    }
    _socket = socket;

    var opened = false;
    var cursor = since;
    String? selfId;
    final done = Completer<int?>();
    final subscription = socket.messages.listen(
      (raw) {
        final frame = _parseFrame(raw);
        if (frame == null) return;
        switch (frame['t']) {
          case 'ready':
            final first = !opened && cursor == null;
            opened = true;
            final seq = _seq(frame['seq']);
            final current = cursor;
            if (seq != null && (current == null || seq < current)) {
              cursor = seq;
            }
            selfId = frame['userId']?.toString();
            _emit(const ChatRealtimeReadyEvent());
            if (first) _emit(const ChatRealtimeResyncEvent());
          case 'event':
            final seq = _seq(frame['seq']);
            if (seq != null) cursor = max(cursor ?? 0, seq);
            final event = _eventFromWorker(frame['event'], conversationId);
            if (event != null) _emit(event);
          case 'resync':
            _emit(const ChatRealtimeResyncEvent());
          case 'typing':
            final userId = frame['userId']?.toString();
            if (conversationId != null &&
                userId != null &&
                userId.isNotEmpty &&
                userId != selfId) {
              _emit(
                ChatRealtimeTypingEvent(
                  conversationId: conversationId!,
                  actorUserId: userId,
                  isTyping: frame['on'] == true,
                ),
              );
            }
          default:
            break;
        }
      },
      onError: (_) {
        if (!done.isCompleted) done.complete(socket?.closeCode?.call());
      },
      onDone: () {
        if (!done.isCompleted) done.complete(socket?.closeCode?.call());
      },
    );
    final code = await done.future;
    await subscription.cancel();
    if (identical(_socket, socket)) _socket = null;
    await socket.close();
    return _SocketStop(opened: opened, since: cursor, code: code);
  }
}

Uri _withSince(String url, int? since) {
  final uri = Uri.parse(url);
  if (since == null) return uri;
  return uri.replace(
    queryParameters: {...uri.queryParameters, 'since': '$since'},
  );
}

int? _seq(Object? value) => value is num ? value.toInt() : null;

Map<String, dynamic>? _parseFrame(Object? raw) {
  if (raw is! String) return null;
  try {
    final value = jsonDecode(raw);
    return value is Map<String, dynamic> ? value : null;
  } on Object {
    return null;
  }
}

ChatRealtimeEvent? _eventFromWorker(Object? raw, String? roomId) {
  if (raw is! Map) return null;
  final payload = Map<String, dynamic>.from(raw);
  switch (payload['type']) {
    case 'conversation.created':
    case 'conversation.updated':
      final conversation = payload['conversation'];
      if (conversation is Map &&
          conversation['wsId'] is String &&
          conversation['members'] is List) {
        return ChatRealtimeConversationEvent(
          type: payload['type'].toString(),
          conversation: ChatConversation.fromJson(
            Map<String, dynamic>.from(conversation),
          ),
        );
      }
      return const ChatRealtimeResyncEvent();
    case 'conversation.deleted':
      final result = payload['result'];
      final conversationId = result is Map
          ? result['conversationId']?.toString()
          : payload['conversationId']?.toString();
      if (conversationId == null || conversationId.isEmpty) {
        return const ChatRealtimeResyncEvent();
      }
      return ChatRealtimeConversationDeletedEvent(conversationId);
    case 'message.created':
    case 'message.updated':
    case 'message.deleted':
    case 'reaction.updated':
      final message = payload['message'];
      if (message is Map &&
          message['conversationId'] is String &&
          message['createdAt'] is String) {
        return ChatRealtimeMessageEvent(
          type: payload['type'].toString(),
          message: ChatMessage.fromJson(Map<String, dynamic>.from(message)),
        );
      }
      return const ChatRealtimeResyncEvent();
    case 'typing.updated':
      return ChatRealtimeTypingEvent(
        conversationId: payload['conversationId']?.toString() ?? roomId ?? '',
        actorUserId: payload['actorUserId']?.toString(),
        isTyping: payload['isTyping'] == true,
      );
    case 'read.updated':
    case 'member.removed':
      return const ChatRealtimeResyncEvent();
    default:
      return null;
  }
}
