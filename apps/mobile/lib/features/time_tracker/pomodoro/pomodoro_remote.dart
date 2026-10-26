import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'package:mobile/core/realtime/cloudflare_channel.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

/// The shared Pomodoro as the server holds it, on this device's clock.
typedef RemotePomodoro = ({
  int revision,
  PomodoroPhase phase,
  DateTime? deadline,
  Duration remaining,
  int completedFocus,
  String? sessionId,
  String? taskId,
  String? title,
  PomodoroSettings? config,
});

/// The server has no shared Pomodoro (an older deployment); the device
/// Pomodoro keeps working on its own.
class PomodoroRemoteUnavailable implements Exception {
  const PomodoroRemoteUnavailable();
}

/// The shared Pomodoro changed elsewhere since it was read.
class PomodoroRemoteConflict implements Exception {
  const PomodoroRemoteConflict();
}

const Map<String, PomodoroPhase> _phases = {
  'idle': PomodoroPhase.idle,
  'focus': PomodoroPhase.focus,
  'short_break': PomodoroPhase.shortBreak,
  'long_break': PomodoroPhase.longBreak,
};

/// The cross-device Pomodoro API (`/time-tracking/pomodoro`). The server
/// plans every phase change and never starts focus on its own; deadlines
/// arrive with `serverNow`, so they are moved onto this device's clock.
class PomodoroRemote {
  PomodoroRemote({ApiClient? api, DateTime Function()? now, Random? random})
    : _api = api ?? ApiClient(),
      _now = now ?? DateTime.now,
      _random = random ?? Random.secure();

  final ApiClient _api;
  final DateTime Function() _now;
  final Random _random;

  static String _path(String wsId) =>
      '/api/v1/workspaces/$wsId/time-tracking/pomodoro';

  /// The actor's private realtime topic.
  static String topic(String wsId, String userId) =>
      'time-tracker-pomodoro-$wsId-$userId';

  /// A new command id (UUID v4); retries reuse it.
  String newCommandId() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20),
    ].join('-');
  }

  Future<RemotePomodoro> read(String wsId) =>
      _call(() => _api.getJson(_path(wsId)));

  /// Sends a command. A transport failure is retried once with the same
  /// id, which the server replays instead of applying twice.
  Future<RemotePomodoro> command(
    String wsId, {
    required String type,
    required int expectedRevision,
    String? title,
    String? taskId,
  }) {
    final body = {
      'type': type,
      'commandId': newCommandId(),
      'expectedRevision': expectedRevision,
      if (title != null) 'title': title,
      if (taskId != null) 'taskId': taskId,
    };
    return _call(() async {
      try {
        return await _api.postJson(_path(wsId), body);
      } on ApiException catch (error) {
        if (error.failureKind != ApiFailureKind.transport) rethrow;
        return await _api.postJson(_path(wsId), body);
      }
    });
  }

  Future<RemotePomodoro> configure(
    String wsId, {
    required int expectedRevision,
    required PomodoroSettings settings,
  }) => _call(
    () => _api.putJson(_path(wsId), {
      'commandId': newCommandId(),
      'expectedRevision': expectedRevision,
      'config': settings.toJson(),
    }),
  );

  Future<RemotePomodoro> _call(
    Future<Map<String, dynamic>> Function() send,
  ) async {
    final Map<String, dynamic> body;
    try {
      body = await send();
    } on ApiException catch (error) {
      throw switch (error.statusCode) {
        404 || 405 => const PomodoroRemoteUnavailable(),
        409 when error.message == 'timer_running' =>
          const PomodoroSessionConflict(),
        409 => const PomodoroRemoteConflict(),
        _ => error,
      };
    }
    return parse(body, _now());
  }

  /// A response body as seen from a device whose clock reads [now].
  @visibleForTesting
  static RemotePomodoro parse(Map<String, dynamic> body, DateTime now) {
    final state = body['state'];
    if (state is! Map<String, dynamic>) {
      throw const FormatException('Pomodoro response without state');
    }
    final serverNow = DateTime.tryParse(body['serverNow'] as String? ?? '');
    final skew = serverNow == null ? Duration.zero : serverNow.difference(now);
    final deadline = DateTime.tryParse(state['deadlineAt'] as String? ?? '');
    final config = body['config'];
    return (
      revision: state['revision'] as int? ?? 0,
      phase: _phases[state['phase']] ?? PomodoroPhase.idle,
      deadline: deadline?.subtract(skew).toLocal(),
      remaining: Duration(milliseconds: state['remainingMs'] as int? ?? 0),
      completedFocus: state['completedFocus'] as int? ?? 0,
      sessionId: state['sessionId'] as String?,
      taskId: state['taskId'] as String?,
      title: state['title'] as String?,
      config: config is Map<String, dynamic>
          ? PomodoroSettings.fromJson(config)
          : null,
    );
  }

  /// Calls [onChange] whenever the shared Pomodoro changes elsewhere.
  /// Returns the function that ends the subscription.
  Future<void> Function() subscribe(
    String wsId,
    String userId,
    void Function() onChange,
  ) {
    final channel = CloudflareChannel(
      resolveTicket: () => _api.postJson('/api/v1/realtime/channels', {
        'topic': topic(wsId, userId),
      }),
      onMessage: (message) {
        if (message['type'] == 'broadcast' &&
            message['event'] == 'pomodoro:changed') {
          onChange();
        }
      },
    );
    unawaited(channel.connect());
    return channel.close;
  }
}
