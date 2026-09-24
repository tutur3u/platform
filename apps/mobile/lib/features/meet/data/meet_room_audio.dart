import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';

/// Plays room-wide Mira Live PCM without coupling playback to the meeting mic.
class MeetRoomAudio extends ChangeNotifier {
  MeetRoomAudio({AssistantLiveAudioPlayer? player, int Function()? nowMillis})
    : _player = player ?? AssistantLiveAudioPlayer(),
      _nowMillis = nowMillis ?? _systemNow;

  final AssistantLiveAudioPlayer _player;
  final int Function() _nowMillis;
  String? sessionId;
  bool enabled = true;
  bool failed = false;
  int _lastSequence = -1;
  int? _clockOffset;
  bool _disposed = false;

  static int _systemNow() => DateTime.now().millisecondsSinceEpoch;

  void handle(Map<String, dynamic> message) {
    if (_disposed) return;
    final type = message['type'];
    if (type == 'ready' || type == 'room.ended') {
      _deactivate();
      return;
    }
    if (type == 'assistant.live') {
      final id = message['sessionId'] as String?;
      if (message['active'] == true && id != null && id.isNotEmpty) {
        if (sessionId == id) return;
        _deactivate();
        sessionId = id;
        failed = false;
        notifyListeners();
      } else if (id == sessionId) {
        _deactivate();
      }
      return;
    }
    if (message['sessionId'] != sessionId || sessionId == null) return;
    if (type == 'assistant.interrupted') {
      _clearPlayer();
      return;
    }
    if (type != 'assistant.audio' || !enabled || failed) return;
    final sequence = message['sequence'];
    final at = message['at'];
    final data = message['data'];
    if (sequence is! int || at is! int || data is! String) return;
    if (sequence <= _lastSequence || data.length > 128000) return;
    final offset = _nowMillis() - at;
    _clockOffset = _clockOffset == null
        ? offset
        : (_clockOffset! < offset ? _clockOffset! : offset);
    if ((offset - _clockOffset!).abs() > 5000) return;
    Uint8List bytes;
    try {
      bytes = base64Decode(data);
    } on FormatException {
      return;
    }
    if (bytes.isEmpty || bytes.length.isOdd || bytes.length > 96000) return;
    _lastSequence = sequence;
    unawaited(_player.play(bytes).catchError(_onPlaybackError));
  }

  void setEnabled({required bool value}) {
    if (_disposed || enabled == value) return;
    final retry = failed;
    enabled = value;
    failed = false;
    if (!value) _pausePlayer();
    if (retry) _clearPlayer();
    notifyListeners();
  }

  void reset() => _deactivate();

  void _deactivate() {
    if (sessionId == null) return;
    sessionId = null;
    _lastSequence = -1;
    _clockOffset = null;
    failed = false;
    _pausePlayer();
    notifyListeners();
  }

  void _clearPlayer() {
    unawaited(_player.clear().catchError(_onPlaybackError));
  }

  void _pausePlayer() {
    unawaited(_player.pause().catchError(_onPlaybackError));
  }

  void _onPlaybackError(Object _) {
    if (_disposed) return;
    failed = true;
    enabled = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_player.dispose());
    super.dispose();
  }
}
