import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';

import '../live_dispatch_transport.dart';

void main() {
  late LiveDispatchTransport wire;
  setUp(() => wire = LiveDispatchTransport());
  tearDown(() => wire.dispose());

  test('missing channel refuses text and image without calling a sink', () {
    expect(
      wire.socket.sendText('question'),
      AssistantLiveSinkAdmission.refused,
    );
    expect(
      wire.socket.sendVideoFrame(Uint8List.fromList([1])),
      AssistantLiveSinkAdmission.refused,
    );
    expect(wire.admitted, isEmpty);
    expect(wire.textAttempts, 0);
  });

  test(
    'local add admits exactly one text frame without a server ACK',
    () async {
      await wire.open();
      expect(
        wire.socket.sendText('question'),
        AssistantLiveSinkAdmission.admitted,
      );
      expect(wire.texts, ['question']);
      expect(wire.textAttempts, 1);
    },
  );

  test('blank text and empty image refuse even on an open sink', () async {
    await wire.open();
    final before = wire.admitted.length;
    expect(wire.socket.sendText('  '), AssistantLiveSinkAdmission.refused);
    expect(
      wire.socket.sendVideoFrame(Uint8List(0)),
      AssistantLiveSinkAdmission.refused,
    );
    expect(wire.admitted.length, before);
  });

  for (final closure in [
    'disconnect',
    'provider done',
    'close code',
    'error',
  ]) {
    test('$closure prevents further text and image sink calls', () async {
      await wire.open();
      switch (closure) {
        case 'disconnect':
          await wire.socket.disconnect();
        case 'provider done':
          await wire.frames.close();
        case 'close code':
          wire.closeCode = 1000;
        case 'error':
          wire.frames.addError(StateError('Synthetic stream failure'));
          await Future<void>.delayed(Duration.zero);
      }
      final before = wire.admitted.length;
      expect(
        wire.socket.sendText('question'),
        AssistantLiveSinkAdmission.refused,
      );
      expect(
        wire.socket.sendVideoFrame(Uint8List.fromList([1])),
        AssistantLiveSinkAdmission.refused,
      );
      expect(wire.admitted.length, before);
      expect(wire.textAttempts, 0);
    });
  }

  for (final image in [false, true]) {
    test(
      '${image ? 'image' : 'text'} add throwing after dispatch is unknown',
      () async {
        await wire.open();
        wire
          ..throwAfterTextAdd = !image
          ..throwAfterVideoAdd = image;
        final result = image
            ? wire.socket.sendVideoFrame(Uint8List.fromList([1]))
            : wire.socket.sendText('question');
        expect(result, AssistantLiveSinkAdmission.unknown);
        final inputs = wire.admitted.where(
          (frame) => frame.containsKey('realtimeInput'),
        );
        expect(inputs.length, 1);
        expect(
          wire.socket.sendText('later'),
          AssistantLiveSinkAdmission.refused,
        );
        await Future<void>.delayed(Duration.zero);
        expect(inputs.length, 1);
      },
    );
  }

  test(
    'audio callers retain their existing throwing failure contract',
    () async {
      await wire.open();
      wire.throwAfterAudioAdd = true;
      expect(
        () => wire.socket.sendAudioChunk(Uint8List.fromList([0, 1])),
        throwsStateError,
      );
      expect(wire.socket.sendText('later'), AssistantLiveSinkAdmission.refused);
    },
  );

  test(
    'a fresh explicit connection can admit after a closed generation',
    () async {
      await wire.open();
      await wire.socket.disconnect();
      expect(wire.socket.sendText('old'), AssistantLiveSinkAdmission.refused);
      await wire.open();
      expect(wire.socket.sendText('new'), AssistantLiveSinkAdmission.admitted);
      expect(wire.texts, ['new']);
      expect(wire.textAttempts, 1);
    },
  );
}
