import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_action.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_coordinator.dart';

/// Native shortcut inbox. Native code queues actions (before or after the
/// engine starts) and sends `pendingAvailable` as a payload-free signal; Dart
/// always drains with `takePending`, so each action is delivered once.
class AssistantLaunchChannel {
  AssistantLaunchChannel({
    MethodChannel? channel,
    AssistantLaunchCoordinator? coordinator,
    DateTime Function()? clock,
  }) : _channel = channel ?? const MethodChannel(channelName),
       _coordinator = coordinator ?? AssistantLaunchCoordinator.instance,
       _clock = clock ?? DateTime.now;

  static const channelName = 'mobile/assistant_shortcuts';

  final MethodChannel _channel;
  final AssistantLaunchCoordinator _coordinator;
  final DateTime Function() _clock;
  Future<void>? _draining;

  static bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  /// Installs the signal handler and drains any cold-start action.
  Future<void> start() async {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'pendingAvailable') await drain();
    });
    await drain();
  }

  void stop() => _channel.setMethodCallHandler(null);

  Future<void> drain() {
    final running = _draining;
    if (running != null) {
      return running.then((_) => _drainOnce());
    }
    return _draining = _drainOnce().whenComplete(() => _draining = null);
  }

  Future<void> _drainOnce() async {
    List<Object?>? raw;
    try {
      raw = await _channel.invokeListMethod<Object?>('takePending');
    } on MissingPluginException {
      return;
    } on PlatformException catch (error) {
      if (kDebugMode) debugPrint('Assistant shortcut drain failed: $error');
      return;
    }
    final now = _clock();
    for (final item in raw ?? const <Object?>[]) {
      final action = AssistantLaunchAction.fromNative(item, receivedAt: now);
      if (action != null) _coordinator.submit(action);
    }
  }
}
