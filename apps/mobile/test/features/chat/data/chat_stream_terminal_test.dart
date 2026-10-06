import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const receipt =
    '{"type":"messages","messages":[{"id":"saved-reply",'
    '"conversationId":"chat","kind":"assistant",'
    '"content":"Saved answer"}]}\n';
Stream<ChatMessageStreamEvent> send(Stream<List<int>> body) {
  final api = _Api();
  when(
    () => api.sendJsonStream(
      'POST',
      '/api/v1/workspaces/ws/chat/conversations/chat/messages',
      any(),
      accept: 'application/x-ndjson',
    ),
  ).thenAnswer(
    (_) async => http.StreamedResponse(
      body,
      201,
      headers: {'content-type': 'application/x-ndjson'},
    ),
  );
  return ChatRepository(apiClient: api).sendMessageStream(
    'ws',
    'chat',
    content: 'Synthetic prompt',
    miraMode: true,
  );
}

void main() {
  test('slow consumers pause and resume the source body', () async {
    final paused = Completer<void>();
    final resumed = Completer<void>();
    final finished = Completer<void>();
    final firstEvent = Completer<void>();
    final body = StreamController<List<int>>(
      onPause: () {
        if (!paused.isCompleted) paused.complete();
      },
      onResume: () {
        if (!resumed.isCompleted) resumed.complete();
      },
    );
    final events = <ChatMessageStreamEvent>[];
    late StreamSubscription<ChatMessageStreamEvent> subscription;
    subscription = send(body.stream).listen((event) {
      events.add(event);
      if (events.length == 1) {
        subscription.pause();
        firstEvent.complete();
      }
    }, onDone: finished.complete);
    body.add(utf8.encode('{"type":"assistant_delta","delta":"Partial"}\n'));
    try {
      await firstEvent.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('First event was not delivered'),
      );
      body.add(utf8.encode('{"type":"assistant_delta","delta":" next"}\n'));
      await paused.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Source was not paused'),
      );
      expect(events, hasLength(1));
      subscription.resume();
      await resumed.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Source was not resumed'),
      );
      body.add(utf8.encode('$receipt{"type":"done"}\n'));
      await finished.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Response was not completed'),
      );
      expect(events.last, isA<ChatStreamDoneEvent>());
    } finally {
      await subscription.cancel();
      await body.close();
    }
  });
  test('saved reply and done cancel an open response body', () async {
    var canceled = false;
    final body = StreamController<List<int>>(
      onCancel: () {
        canceled = true;
      },
    );
    final result = send(body.stream).toList();
    body.add(utf8.encode('$receipt{"type":"done"}\n'));
    try {
      final events = await result.timeout(const Duration(milliseconds: 250));
      expect(events.last, isA<ChatStreamDoneEvent>());
      expect(canceled, isTrue);
    } finally {
      await body.close();
    }
  });
  for (final stalled in [false, true]) {
    test(
      'completed receipt survives ${stalled ? 'stalled' : 'failed'} cleanup',
      () async {
        final cleanup = Completer<void>();
        final body = StreamController<List<int>>(
          onCancel: () => stalled
              ? cleanup.future
              : Future<void>.error(StateError('Synthetic cleanup failure')),
        );
        final result = send(body.stream).toList();
        body.add(utf8.encode('$receipt{"type":"done"}\n'));
        try {
          final events = await result.timeout(
            const Duration(milliseconds: 250),
          );
          expect(events.last, isA<ChatStreamDoneEvent>());
        } finally {
          if (!cleanup.isCompleted) cleanup.complete();
          await body.close();
        }
      },
    );
  }

  test(
    'malformed same-chunk trailer cannot fail a durably completed reply',
    () async {
      final events = await send(
        Stream.value(utf8.encode('$receipt{"type":"done"}\nnot-json\n')),
      ).toList();
      expect(events.last, isA<ChatStreamDoneEvent>());
    },
  );
  test('unterminated and unacknowledged streams remain errors', () async {
    const userOnly =
        '{"type":"message","message":{"id":"user-ack", '
        '"kind":"user"}}\n{"type":"done"}\n';
    for (final content in [
      '{"type":"assistant_delta","delta":"Partial"}\n',
      receipt,
      userOnly,
      '{"type":"assistant_delta","delta":"Unsaved"}\n{"type":"done"}\n',
    ]) {
      final errors = <Object>[];
      await send(Stream.value(utf8.encode(content)))
          .listen((_) {}, onError: errors.add)
          .asFuture<void>()
          .catchError(errors.add);
      expect(errors, contains(isA<StateError>()));
    }
  });
  test('explicit server error is preserved before done', () async {
    final events = await send(
      Stream.value(
        utf8.encode(
          '{"type":"assistant_delta", '
          '"delta":"Partial"}\n{"type":"error", '
          '"message":"Not saved"}\n{"type":"done"}\n',
        ),
      ),
    ).toList();
    expect(
      events.whereType<ChatStreamErrorEvent>().single.message,
      'Not saved',
    );
    expect(events.last, isA<ChatStreamDoneEvent>());
  });
  test('malformed preterminal data still fails', () async {
    await expectLater(
      send(Stream.value(utf8.encode('$receipt malformed\n'))).toList(),
      throwsA(isA<FormatException>()),
    );
  });
  test('invalid UTF-8 after same-chunk completion is ignored', () async {
    final events = await send(
      Stream.value([...utf8.encode('$receipt{"type":"done"}\n'), 0xff]),
    ).toList();
    expect(events.last, isA<ChatStreamDoneEvent>());
  });
  test('invalid preterminal UTF-8 remains a failure', () async {
    await expectLater(
      send(Stream.value([...utf8.encode(receipt), 0xff, 10])).toList(),
      throwsA(isA<FormatException>()),
    );
  });
  test('failed cleanup preserves the original transport failure', () async {
    final failure = StateError('Synthetic transport failure');
    final body = StreamController<List<int>>(
      onCancel: () =>
          Future<void>.error(StateError('Synthetic cleanup failure')),
    );
    final result = send(body.stream).toList();
    body.addError(failure);
    await expectLater(result, throwsA(same(failure)));
    await body.close();
  });
  test('parser preserves Unicode split at every UTF-8 byte boundary', () {
    const text = 'Xin chào Việt Nam';
    final parser = ChatNdjsonStreamParser();
    final events = <ChatMessageStreamEvent>[];
    for (final byte in utf8.encode(
      '${jsonEncode({'type': 'assistant_delta', 'delta': text})}\n',
    )) {
      events.addAll(parser.addChunk([byte]));
    }
    events.addAll(parser.close());
    expect(
      events.whereType<ChatStreamAssistantDeltaEvent>().single.delta,
      text,
    );
  });
}
