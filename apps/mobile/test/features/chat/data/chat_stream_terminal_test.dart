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
    '{"type":"messages","messages":[{'
    '"id":"33333333-3333-4333-8333-333333333333",'
    '"conversationId":"22222222-2222-4222-8222-222222222222",'
    '"kind":"assistant",'
    '"createdAt":"2026-10-12T00:00:00Z","metadata":{},'
    '"content":"Saved answer"}]}\n';
const _deliveryDeadline = Duration(milliseconds: 250);
const _readinessDeadline = Duration(seconds: 5);

class _Readiness {
  final entered = Completer<void>();
  final returned = Completer<void>();
  final listened = Completer<void>();
  final canceled = Completer<void>();
  Future<void> wait() => Future.wait([
    entered.future,
    returned.future,
    listened.future,
  ]).timeout(_readinessDeadline);
  String get evidence =>
      'mockEntered=${entered.isCompleted} '
      'mockReturned=${returned.isCompleted} '
      'bodyListened=${listened.isCompleted} '
      'bodyCanceled=${canceled.isCompleted}';
}

typedef _CleanupFailure = ({Object error, StackTrace stack});
Future<List<_CleanupFailure>> _cleanupFixture(
  Future<void> Function() cancel,
  Future<void> Function() close,
  String evidence,
) async {
  final failures = <_CleanupFailure>[];
  for (final phase in [
    (name: 'Cancellation', work: cancel),
    (name: 'Fixture close', work: close),
  ]) {
    try {
      await Future<void>.sync(phase.work).timeout(
        _deliveryDeadline,
        onTimeout: () => throw StateError('${phase.name} stalled: $evidence'),
      );
    } on Object catch (error, stack) {
      failures.add((error: error, stack: stack));
    }
  }
  return failures;
}

Future<void> _drainUnlistenedFixture(
  StreamController<List<int>> body,
  List<_CleanupFailure> failures,
) async {
  try {
    final closed = body.close();
    await body.stream.drain<void>().timeout(_readinessDeadline);
    await closed.timeout(_deliveryDeadline);
  } on Object catch (error, stack) {
    failures.add((error: error, stack: stack));
  }
}

void _throwFixtureFailure(
  Object? primary,
  StackTrace? stack,
  List<_CleanupFailure> cleanup,
) {
  if (primary != null) Error.throwWithStackTrace(primary, stack!);
  if (cleanup.isNotEmpty) {
    Error.throwWithStackTrace(cleanup.first.error, cleanup.first.stack);
  }
}

Stream<ChatMessageStreamEvent> _send(
  Stream<List<int>> body, {
  _Readiness? readiness,
  Future<http.StreamedResponse>? heldResponse,
}) {
  final api = _Api();
  when(
    () => api.sendJsonStream(
      'POST',
      '/api/v1/workspaces/ws/chat/conversations/chat/messages',
      any(),
      accept: 'application/x-ndjson',
    ),
  ).thenAnswer((_) async {
    readiness?.entered.complete();
    final response = heldResponse != null
        ? await heldResponse
        : http.StreamedResponse(
            body,
            201,
            headers: {'content-type': 'application/x-ndjson'},
          );
    readiness?.returned.complete();
    return response;
  });
  return ChatRepository(apiClient: api).sendMessageStream(
    'ws',
    'chat',
    content: 'Synthetic prompt',
    miraMode: true,
  );
}

void main() {
  test('slow consumers pause and resume the source body', () async {
    final readiness = _Readiness();
    final paused = Completer<void>();
    final resumed = Completer<void>();
    final finished = Completer<void>();
    final firstEvent = Completer<void>();
    final body = StreamController<List<int>>(
      onListen: readiness.listened.complete,
      onCancel: readiness.canceled.complete,
      onPause: () {
        if (!paused.isCompleted) paused.complete();
      },
      onResume: () {
        if (!resumed.isCompleted) resumed.complete();
      },
    );
    final events = <ChatMessageStreamEvent>[];
    late StreamSubscription<ChatMessageStreamEvent> subscription;
    subscription = _send(body.stream, readiness: readiness).listen((event) {
      events.add(event);
      if (events.length == 1) {
        subscription.pause();
        firstEvent.complete();
      }
    }, onDone: finished.complete);
    var phase = 'readiness';
    Object? primary;
    StackTrace? primaryStack;
    var cleanup = <_CleanupFailure>[];
    try {
      await readiness.wait();
      body.add(utf8.encode('{"type":"assistant_delta","delta":"Partial"}\n'));
      phase = 'first-event';
      await firstEvent.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('First event was not delivered'),
      );
      body.add(utf8.encode('{"type":"assistant_delta","delta":" next"}\n'));
      phase = 'source-pause';
      await paused.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Source was not paused'),
      );
      expect(events, hasLength(1));
      subscription.resume();
      phase = 'source-resume';
      await resumed.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Source was not resumed'),
      );
      body.add(utf8.encode('$receipt{"type":"done"}\n'));
      phase = 'completion';
      await finished.future.timeout(
        const Duration(milliseconds: 250),
        onTimeout: () => throw StateError('Response was not completed'),
      );
      expect(events.last, isA<ChatStreamDoneEvent>());
    } on Object catch (error, stack) {
      primary = error;
      primaryStack = stack;
    } finally {
      final evidence =
          'phase=$phase first=${firstEvent.isCompleted} '
          'paused=${paused.isCompleted} resumed=${resumed.isCompleted} '
          'finished=${finished.isCompleted}';
      cleanup = await _cleanupFixture(
        subscription.cancel,
        body.close,
        '$evidence ${readiness.evidence}',
      );
      if (!readiness.listened.isCompleted) {
        await _drainUnlistenedFixture(body, cleanup);
      }
    }
    _throwFixtureFailure(primary, primaryStack, cleanup);
  });
  test('early phase failure survives paused fixture cleanup', () async {
    final first = Completer<void>();
    final cleanup = Completer<void>();
    final body = StreamController<List<int>>(onCancel: () => cleanup.future);
    late StreamSubscription<ChatMessageStreamEvent> subscription;
    subscription = _send(body.stream).listen((_) {
      if (!first.isCompleted) {
        subscription.pause();
        first.complete();
      }
    });
    body.add(utf8.encode('{"type":"assistant_delta","delta":"Partial"}\n'));
    Object? observed;
    try {
      try {
        await first.future.timeout(const Duration(milliseconds: 250));
        throw StateError('Synthetic phase failure');
      } finally {
        await subscription.cancel().timeout(const Duration(milliseconds: 250));
        await body.close().timeout(const Duration(milliseconds: 250));
      }
    } on Object catch (error) {
      observed = error;
    } finally {
      cleanup.complete();
      subscription.resume();
      await subscription.cancel().timeout(const Duration(milliseconds: 250));
      await body.close().timeout(const Duration(milliseconds: 250));
    }
    expect(
      observed,
      isA<StateError>().having(
        (error) => error.message,
        'original phase error',
        'Synthetic phase failure',
      ),
    );
  });

  test('saved reply and done cancel an open response body', () async {
    var canceled = false;
    final body = StreamController<List<int>>(
      onCancel: () {
        canceled = true;
      },
    );
    final result = _send(body.stream).toList();
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
        final result = _send(body.stream).toList();
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
      final events = await _send(
        Stream.value(utf8.encode('$receipt{"type":"done"}\nnot-json\n')),
      ).toList();
      expect(events.last, isA<ChatStreamDoneEvent>());
    },
  );
  test('unterminated and unacknowledged streams remain errors', () async {
    const userOnly =
        '{"type":"message","message":{'
        '"id":"44444444-4444-4444-8444-444444444444",'
        '"conversationId":"22222222-2222-4222-8222-222222222222",'
        '"kind":"user","content":"Synthetic prompt", '
        '"createdAt":"2026-10-12T00:00:00Z",'
        '"metadata":{"clientRequestId": '
        '"55555555-5555-4555-8555-555555555555"} '
        '}}\n{"type":"done"}\n';
    for (final content in [
      '{"type":"assistant_delta","delta":"Partial"}\n',
      receipt,
      userOnly,
      '{"type":"assistant_delta","delta":"Unsaved"}\n{"type":"done"}\n',
    ]) {
      final errors = <Object>[];
      await _send(Stream.value(utf8.encode(content)))
          .listen((_) {}, onError: errors.add)
          .asFuture<void>()
          .catchError(errors.add);
      expect(errors, contains(isA<StateError>()));
    }
  });
  test('explicit server error is preserved before done', () async {
    final events = await _send(
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
      _send(Stream.value(utf8.encode('$receipt malformed\n'))).toList(),
      throwsA(isA<FormatException>()),
    );
  });
  test('invalid UTF-8 after same-chunk completion is ignored', () async {
    final events = await _send(
      Stream.value([...utf8.encode('$receipt{"type":"done"}\n'), 0xff]),
    ).toList();
    expect(events.last, isA<ChatStreamDoneEvent>());
  });
  test('invalid preterminal UTF-8 remains a failure', () async {
    await expectLater(
      _send(Stream.value([...utf8.encode(receipt), 0xff, 10])).toList(),
      throwsA(isA<FormatException>()),
    );
  });
  test('failed cleanup preserves the original transport failure', () async {
    final failure = StateError('Synthetic transport failure');
    final body = StreamController<List<int>>(
      onCancel: () =>
          Future<void>.error(StateError('Synthetic cleanup failure')),
    );
    final result = _send(body.stream).toList();
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
  test(
    'held mock readiness preserves primary failure and records secondary close',
    () async {
      final readiness = _Readiness();
      final held = Completer<http.StreamedResponse>();
      final first = Completer<void>();
      final body = StreamController<List<int>>(
        onListen: readiness.listened.complete,
        onCancel: readiness.canceled.complete,
      );
      final subscription = _send(
        body.stream,
        readiness: readiness,
        heldResponse: held.future,
      ).listen((_) => first.complete());
      Object? primary;
      StackTrace? primaryStack;
      var cleanup = <_CleanupFailure>[];
      var neverListened = false;
      try {
        await readiness.entered.future.timeout(_readinessDeadline);
        body.add(utf8.encode('{"type":"assistant_delta","delta":"Partial"}\n'));
        await first.future.timeout(
          _deliveryDeadline,
          onTimeout: () => throw StateError('First event was not delivered'),
        );
      } on Object catch (error, stack) {
        primary = error;
        primaryStack = stack;
      } finally {
        final cancellation = subscription.cancel();
        held.complete(
          http.StreamedResponse(
            body.stream,
            201,
            headers: {'content-type': 'application/x-ndjson'},
          ),
        );
        cleanup = await _cleanupFixture(
          () => cancellation,
          body.close,
          readiness.evidence,
        );
        neverListened = !readiness.listened.isCompleted;
        if (neverListened) await _drainUnlistenedFixture(body, cleanup);
      }
      expect(neverListened, true);
      expect(readiness.entered.isCompleted, true);
      expect(readiness.returned.isCompleted, true);
      expect(
        cleanup.map((failure) => failure.error),
        contains(
          isA<StateError>().having(
            (error) => error.message,
            'secondary error',
            startsWith('Fixture close stalled'),
          ),
        ),
      );
      expect(
        () => _throwFixtureFailure(primary, primaryStack, cleanup),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'primary error',
            'First event was not delivered',
          ),
        ),
      );
    },
  );
}
