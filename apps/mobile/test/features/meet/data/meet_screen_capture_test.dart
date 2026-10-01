import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_screen_capture.dart';
import 'package:mocktail/mocktail.dart';

class _Stream extends Mock implements MediaStream {}

class _Track extends Mock implements MediaStreamTrack {}

void main() {
  setUp(() => debugDefaultTargetPlatformOverride = TargetPlatform.iOS);
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test(
    'late consent after revoke stops capture without an active track',
    () async {
      final completion = Completer<MediaStream>();
      final stream = _Stream();
      final track = _Track();
      when(stream.getTracks).thenReturn([track]);
      when(stream.getVideoTracks).thenReturn([track]);
      when(track.stop).thenAnswer((_) async {});
      when(stream.dispose).thenAnswer((_) async {});
      final capture = MeetScreenCapture(capture: () => completion.future);
      final start = capture.start(
        title: 'synthetic',
        stopLabel: 'Stop',
        onStopped: () {},
      );
      capture.cancel();
      completion.complete(stream);
      await start;
      expect(capture.track, isNull);
      verify(track.stop).called(1);
      verify(stream.dispose).called(1);
    },
  );

  test('failed capture leaves no active stream and can be retried', () async {
    var attempts = 0;
    final capture = MeetScreenCapture(
      capture: () async {
        attempts++;
        throw StateError('synthetic permission denial');
      },
    );
    for (var i = 0; i < 2; i++) {
      await expectLater(
        capture.start(title: 'synthetic', stopLabel: 'Stop', onStopped: () {}),
        throwsStateError,
      );
      expect(capture.track, isNull);
    }
    expect(attempts, 2);
  });
}
