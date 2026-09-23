import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_native_media.dart';
import 'package:mobile/features/meet/data/meet_signaling.dart';

class MeetCallController extends ChangeNotifier {
  MeetCallController({
    required this.workspaceId,
    required this.meetingId,
    MeetRepository? repository,
  }) : _repository = repository ?? MeetRepository(),
       _ownsRepository = repository == null {
    _signaling = MeetSignaling(
      resolveUrl: _resolveUrl,
      onMessage: _onMessage,
      onStatus: _onStatus,
    );
    media = MeetNativeMedia(_signaling)..addListener(_notify);
  }

  final String workspaceId;
  final String meetingId;
  final MeetRepository _repository;
  final bool _ownsRepository;
  late final MeetSignaling _signaling;
  late final MeetNativeMedia media;

  String status = 'connecting';
  String admission = 'connecting';
  String role = 'speaker';
  String? selfUserId;
  String? title;
  String? error;
  bool ended = false;
  bool _started = false;
  bool _disposed = false;
  bool _connectedBefore = false;
  final participants = <String, Map<String, dynamic>>{};
  final waiting = <Map<String, dynamic>>[];
  final messages = <Map<String, dynamic>>[];
  final tracks = <String, MeetRoomTrack>{};

  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      await media.initialize();
      if (!_disposed) await _signaling.connect();
    } on Object {
      if (!_disposed) {
        error = 'connection';
        notifyListeners();
      }
    }
  }

  Future<Uri> _resolveUrl() async {
    final session = await _repository.createRealtimeSession(
      workspaceId,
      meetingId,
    );
    final realtimeUrl = session['realtimeUrl'] as String?;
    final token = session['token'] as String?;
    if (realtimeUrl == null || token == null || token.isEmpty) {
      throw StateError('Meet session unavailable');
    }
    final url = Uri.parse(realtimeUrl);
    return url.replace(
      queryParameters: {...url.queryParameters, 'token': token},
    );
  }

  void _onStatus(String next) {
    if (_disposed) return;
    status = next;
    if (next == 'open') {
      if (error == 'connection') error = null;
      if (_connectedBefore) {
        unawaited(media.resetPeers());
        _sendPresence(join: true);
      }
      _connectedBefore = true;
    } else if (next == 'error') {
      error = 'connection';
    }
    notifyListeners();
  }

  void _onMessage(MeetSignalMessage message) {
    if (_disposed) return;
    final type = message['type'];
    switch (type) {
      case 'ready':
        selfUserId = message['userId'] as String?;
        role = message['role'] as String? ?? 'speaker';
        admission = message['admission'] as String? ?? 'admitted';
        if (message['resumed'] != true) {
          tracks.clear();
          for (final raw in message['tracks'] as List? ?? []) {
            if (raw is Map) _rememberTrack(Map<String, dynamic>.from(raw));
          }
          unawaited(media.resetPeers());
        }
      case 'presence':
        participants.clear();
        for (final raw in message['presence'] as List? ?? []) {
          if (raw is! Map) continue;
          final entry = Map<String, dynamic>.from(raw);
          final id = entry['userId'] as String?;
          if (id != null) participants[id] = entry;
        }
      case 'track.published':
        for (final raw in message['tracks'] as List? ?? []) {
          if (raw is Map) _rememberTrack(Map<String, dynamic>.from(raw));
        }
      case 'track.closed':
        for (final raw in message['tracks'] as List? ?? []) {
          if (raw is Map) {
            tracks.remove('${raw['sessionId']}:${raw['trackName']}');
          }
        }
        unawaited(media.resetPeers());
      case 'admission.pending':
        waiting
          ..clear()
          ..addAll(
            (message['participants'] as List? ?? [])
                .whereType<Map<String, dynamic>>()
                .map(Map<String, dynamic>.from),
          );
      case 'admission.result':
        admission = message['admitted'] == true ? 'admitted' : 'denied';
        if (admission == 'denied') unawaited(_signaling.close());
      case 'participant.removed':
        final id = message['userId'] as String?;
        if (id == selfUserId) {
          admission = 'denied';
          unawaited(_signaling.close());
        } else if (id != null) {
          participants.remove(id);
          tracks.removeWhere((_, track) => track['userId'] == id);
          unawaited(media.resetPeers());
        }
      case 'participant.muted':
        if (message['userId'] == selfUserId) {
          final kinds = message['kinds'] as List? ?? [];
          if (kinds.contains('audio')) {
            unawaited(setMicrophone(enabled: false));
          }
          if (kinds.contains('video')) {
            unawaited(setCamera(enabled: false));
          }
        }
      case 'chat.message':
        final id = message['id'] as String?;
        if (id != null && !messages.any((entry) => entry['id'] == id)) {
          messages.add(message);
          if (messages.length > 100) messages.removeAt(0);
        }
      case 'room.title.changed':
        title = message['title'] as String?;
      case 'room.ended':
        ended = true;
        unawaited(_signaling.close());
      case 'error':
        error = message['error'] as String?;
    }
    _syncMedia();
    notifyListeners();
  }

  void _rememberTrack(MeetRoomTrack track) {
    final session = track['sessionId'] as String?;
    final name = track['trackName'] as String?;
    if (session == null || name == null || track['userId'] == selfUserId) {
      return;
    }
    tracks.removeWhere(
      (_, old) =>
          old['userId'] == track['userId'] &&
          old['trackName'] == name &&
          old['sessionId'] != session,
    );
    tracks['$session:$name'] = track;
  }

  void _syncMedia() {
    if (_disposed || admission != 'admitted') return;
    unawaited(
      media
          .updateRoom(
            selfUserId: selfUserId,
            participants: participants.length,
            admitted: true,
            tracks: tracks.values.toList(),
          )
          .catchError((Object _) {
            if (!_disposed) {
              error = 'media';
              notifyListeners();
            }
          }),
    );
  }

  void _sendPresence({bool join = false}) {
    _signaling.send({
      'type': join ? 'presence.join' : 'presence.update',
      'media': {
        'audioEnabled': media.audioEnabled,
        'videoEnabled': media.videoEnabled,
        'screenEnabled': false,
      },
    });
  }

  Future<void> setMicrophone({required bool enabled}) async {
    await media.setAudioEnabled(enabled: enabled);
    _sendPresence();
  }

  Future<void> setCamera({required bool enabled}) async {
    await media.setVideoEnabled(enabled: enabled);
    _sendPresence();
  }

  Future<void> sendMessage(String body) async {
    final text = body.trim();
    if (text.isEmpty) return;
    await _signaling.request({'type': 'chat.message', 'body': text});
  }

  void decideAdmission(String userId, {required bool admit}) {
    _signaling.send({
      'type': 'admission.decide',
      'userId': userId,
      'admit': admit,
    });
  }

  Future<void> endRoom() async {
    if (role == 'host') {
      await _signaling.request({'type': 'room.end'});
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    media
      ..removeListener(_notify)
      ..dispose();
    unawaited(_signaling.close());
    if (_ownsRepository) _repository.dispose();
    super.dispose();
  }
}
