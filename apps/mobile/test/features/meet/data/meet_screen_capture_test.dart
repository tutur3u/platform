import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_screen_capture.dart';
import 'package:mocktail/mocktail.dart';

class _Stream extends Mock implements MediaStream {}

class _Track extends Mock implements MediaStreamTrack {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
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
  group('actual iOS consent event channels', () {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const live = MethodChannel('mobile/meet_live_screen_capture');
    const events = MethodChannel('mobile/meet_live_screen_capture/events');
    const rtc = MethodChannel('FlutterWebRTC.Method');
    late Completer<void> listening;
    late bool revokeBeforeConsent;
    late int displayRequests;

    Future<void> emit(String type) async {
      final delivered = Completer<void>();
      ServicesBinding.instance.channelBuffers.push(
        events.name,
        const StandardMethodCodec().encodeSuccessEnvelope({'type': type}),
        (_) => delivered.complete(),
      );
      await delivered.future;
    }

    setUp(() {
      listening = Completer<void>();
      revokeBeforeConsent = false;
      displayRequests = 0;
      messenger
        ..setMockMethodCallHandler(events, (call) async {
          if (call.method == 'listen' && !listening.isCompleted) {
            listening.complete();
          }
          return null;
        })
        ..setMockMethodCallHandler(live, (call) async {
          if (call.method == 'start') {
            await listening.future;
            await emit(revokeBeforeConsent ? 'stopped' : 'started');
            return true;
          }
          return null;
        })
        ..setMockMethodCallHandler(
          const MethodChannel('FlutterWebRTC.Event'),
          (_) async => null,
        )
        ..setMockMethodCallHandler(rtc, (call) async {
          if (call.method == 'getDisplayMedia') {
            displayRequests++;
            return {
              'streamId': 'synthetic-stream',
              'audioTracks': <Object?>[],
              'videoTracks': [
                {
                  'id': 'synthetic-screen',
                  'label': 'Screen',
                  'kind': 'video',
                  'enabled': true,
                },
              ],
            };
          }
          return null;
        });
    });
    tearDown(() {
      for (final channel in [
        live,
        events,
        rtc,
        const MethodChannel('FlutterWebRTC.Event'),
      ]) {
        messenger.setMockMethodCallHandler(channel, null);
      }
    });

    test('OS revoke before consent prevents WebRTC allocation', () async {
      revokeBeforeConsent = true;
      var stops = 0;
      final capture = MeetScreenCapture();
      await expectLater(
        capture.start(
          title: 'Synthetic',
          stopLabel: 'Stop',
          onStopped: () => stops++,
        ),
        throwsStateError,
      );
      expect(displayRequests, 0);
      expect(capture.track, isNull);
      expect(stops, 1);
    });

    test(
      'native stop and track end report once and disable publication',
      () async {
        var stops = 0;
        final capture = MeetScreenCapture();
        await capture.start(
          title: 'Synthetic',
          stopLabel: 'Stop',
          onStopped: () => stops++,
        );
        expect(displayRequests, 1);
        final track = capture.track!;
        expect(track.enabled, isTrue);
        final ended = track.onEnded;
        await emit('stopped');
        ended?.call();
        await emit('stopped');
        expect(stops, 1);
        expect(track.enabled, isFalse);
        await capture.stop();
        expect(capture.track, isNull);
      },
    );
  });
}
