import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// User-initiated capture with native consent and the existing iOS extension.
class MeetScreenCapture {
  MeetScreenCapture({Future<MediaStream> Function()? capture})
    : _capture = capture;
  final Future<MediaStream> Function()? _capture;
  static const _methods = MethodChannel('mobile/meet_screen_share');
  static const _events = EventChannel('mobile/meet_screen_share/events');
  static const _live = MethodChannel('mobile/meet_live_screen_capture');
  static const _liveEvents = EventChannel(
    'mobile/meet_live_screen_capture/events',
  );
  MediaStream? stream;
  StreamSubscription<dynamic>? _subscription;
  Completer<void>? _started;
  int _generation = 0;

  void cancel() {
    _generation++;
    track?.enabled = false;
    final started = _started;
    if (started != null && !started.isCompleted) {
      started.completeError(StateError('Broadcast cancelled'));
    }
  }

  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);
  MediaStreamTrack? get track => stream?.getVideoTracks().firstOrNull;

  Future<void> start({
    required String title,
    required String stopLabel,
    required VoidCallback onStopped,
  }) async {
    if (!supported) throw UnsupportedError('Native screen capture unavailable');
    if (stream != null) return;
    final generation = _generation;
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        if (!await Helper.requestCapturePermission()) {
          throw StateError('Screen capture permission declined');
        }
        if (generation != _generation) return;
        _subscription = _events.receiveBroadcastStream().listen(
          (event) {
            if (event == 'stopped') {
              cancel();
              onStopped();
            }
          },
          onError: (Object _) {
            cancel();
            onStopped();
          },
        );
        await _methods.invokeMethod<void>('start', {
          'title': title,
          'stopLabel': stopLabel,
        });
      }
      if (generation != _generation) {
        await stop();
        return;
      }
      if (defaultTargetPlatform == TargetPlatform.iOS && _capture == null) {
        final started = Completer<void>();
        _started = started;
        // Attach an error handler before an OS event can reject startup.
        final ready = started.future.timeout(const Duration(seconds: 65));
        unawaited(
          ready.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
        );
        _subscription = _liveEvents.receiveBroadcastStream().listen(
          (event) {
            if (event is! Map<Object?, Object?>) return;
            if (event['type'] == 'started' && !started.isCompleted) {
              started.complete();
            }
            if (event['type'] == 'stopped') {
              cancel();
              onStopped();
            }
          },
          onError: (Object error) {
            cancel();
            onStopped();
          },
        );
        // Get OS broadcast consent before allocating the WebRTC listener.
        // The extension allows a bounded initial socket connection window.
        await _live.invokeMethod<bool>('start', {
          'transport': 'meet',
          'stopMessage': stopLabel,
        });
        await ready;
        if (generation != _generation) {
          await stop();
          return;
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          'video': {'deviceId': 'broadcast-manual'},
          'audio': false,
        });
      } else {
        stream =
            await (_capture?.call() ??
                navigator.mediaDevices.getDisplayMedia({
                  'video': true,
                  'audio': false,
                }));
      }
      if (generation != _generation) {
        await stop();
        return;
      }
      if (track == null) throw StateError('Screen capture returned no video');
      track!.onEnded = () {
        cancel();
        onStopped();
      };
    } on Object {
      await stop();
      rethrow;
    } finally {
      _started = null;
    }
  }

  Future<void> stop() async {
    cancel();
    final captured = stream;
    stream = null;
    await _subscription?.cancel();
    _subscription = null;
    if (captured != null) {
      for (final track in captured.getTracks()) {
        track.onEnded = null;
        await track.stop();
      }
      await captured.dispose();
    }
    if (!kIsWeb &&
        defaultTargetPlatform == TargetPlatform.iOS &&
        _capture == null) {
      try {
        await _live.invokeMethod<void>('stop');
      } on Object {
        /* Engine/extension is already detached. */
      }
    }
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        await _methods.invokeMethod<void>('stop');
      } on Object {
        /* Engine/extension is already detached. */
      }
    }
  }
}
