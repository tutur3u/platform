import 'dart:io';

import 'package:flutter/services.dart';

class AssistantLiveScreenService {
  static const _iosBroadcastEnabled = bool.fromEnvironment(
    'IOS_LIVE_SCREEN_BROADCAST_ENABLED',
    defaultValue: true,
  );
  static const _methods = MethodChannel('mobile/live_screen_capture');
  static const _events = EventChannel('mobile/live_screen_capture/events');

  bool get isSupported =>
      Platform.isAndroid || (Platform.isIOS && _iosBroadcastEnabled);
  bool get requiresMicrophone => Platform.isIOS;

  Stream<Map<Object?, Object?>> get events => _events
      .receiveBroadcastStream()
      .where((event) => event is Map<Object?, Object?>)
      .cast<Map<Object?, Object?>>();

  Future<bool> start({
    required String notificationTitle,
    required String stopLabel,
    required String stopMessage,
    bool microphoneActive = false,
  }) async =>
      isSupported &&
      (await _methods.invokeMethod<bool>('start', {
            'notificationTitle': notificationTitle,
            'stopLabel': stopLabel,
            'stopMessage': stopMessage,
            'microphoneActive': microphoneActive,
          }) ??
          false);

  Future<void> setMicrophoneActive({required bool active}) async {
    if (Platform.isAndroid) {
      await _methods.invokeMethod<void>('setMicrophoneActive', {
        'active': active,
      });
    }
  }

  Future<void> stop() async {
    if (isSupported) await _methods.invokeMethod<void>('stop');
  }
}
