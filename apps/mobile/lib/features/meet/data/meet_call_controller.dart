import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_native_media.dart';
import 'package:mobile/features/meet/data/meet_personal_chat.dart';
import 'package:mobile/features/meet/data/meet_room_assistant.dart';
import 'package:mobile/features/meet/data/meet_room_audio.dart';
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
    roomAudio = MeetRoomAudio()..addListener(_notify);
    personalChat = MeetPersonalChat(
      workspaceId: workspaceId,
      meetingId: meetingId,
      repository: _repository,
    );
    roomAssistant = MeetRoomAssistant(
      workspaceId: workspaceId,
      meetingId: meetingId,
      repository: _repository,
    );
  }

  final String workspaceId;
  final String meetingId;
  final MeetRepository _repository;
  final bool _ownsRepository;
  late final MeetSignaling _signaling;
  late final MeetNativeMedia media;
  late final MeetRoomAudio roomAudio;
  late final MeetPersonalChat personalChat;
  late final MeetRoomAssistant roomAssistant;

  String status = 'connecting';
  String admission = 'connecting';
  String role = 'speaker';
  String? selfUserId;
  String? title;
  String? error;
  DateTime? roomExpiresAt;
  final settings = <String, dynamic>{};
  final stage = <String, dynamic>{};
  final approved = <Map<String, dynamic>>[];
  final reactions = <Map<String, dynamic>>[];
  String? liveAssistantOwnerId;
  String recordingState = 'idle';
  bool ended = false;
  bool requiresDeviceChoice = false;
  int otherDeviceCount = 0;
  Map<String, dynamic>? _pendingSession;
  final String _deviceId = _newDeviceId();
  bool _started = false;
  Future<void>? _mediaPreparation;
  bool _disposed = false;
  bool _connectedBefore = false;
  final participants = <String, Map<String, dynamic>>{};
  final waiting = <Map<String, dynamic>>[];
  final messages = <Map<String, dynamic>>[];
  final tracks = <String, MeetRoomTrack>{};

  Future<void> prepareMedia() => _mediaPreparation ??= media.initialize();

  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      await prepareMedia();
      if (_disposed) return;
      await _prepareSession();
    } on Object {
      if (!_disposed) {
        _started = false;
        error = 'connection';
        notifyListeners();
      }
    }
  }

  Future<void> _prepareSession({String? joinMode}) async {
    status = 'connecting';
    error = null;
    notifyListeners();
    final session = await _repository.createRealtimeSession(
      workspaceId,
      meetingId,
      deviceId: _deviceId,
      joinMode: joinMode,
    );
    if (_disposed) return;
    requiresDeviceChoice = session['requiresDeviceChoice'] == true;
    otherDeviceCount = session['otherDeviceCount'] as int? ?? 0;
    if (requiresDeviceChoice) {
      status = 'device-choice';
      notifyListeners();
      return;
    }
    _pendingSession = session;
    await _signaling.connect();
  }

  Future<void> chooseDevice({required bool switchToThisDevice}) async {
    if (!requiresDeviceChoice || status == 'connecting') return;
    try {
      await _prepareSession(
        joinMode: switchToThisDevice ? 'switch' : 'additional',
      );
    } on Object {
      if (!_disposed) {
        status = 'device-choice';
        error = 'connection';
        notifyListeners();
      }
    }
  }

  Future<Uri> _resolveUrl() async {
    final session =
        _pendingSession ??
        await _repository.createRealtimeSession(
          workspaceId,
          meetingId,
          deviceId: _deviceId,
          joinMode: 'additional',
        );
    _pendingSession = null;
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
      }
      _connectedBefore = true;
    } else if (next == 'error') {
      error = 'connection';
    }
    if (next == 'reconnecting' || next == 'error' || next == 'closed') {
      roomAudio.reset();
    }
    notifyListeners();
  }

  void _onMessage(MeetSignalMessage message) {
    if (_disposed) return;
    roomAudio.handle(message);
    final type = message['type'];
    switch (type) {
      case 'ready':
        selfUserId = message['userId'] as String?;
        role = message['role'] as String? ?? 'speaker';
        admission = message['admission'] as String? ?? 'admitted';
        roomExpiresAt = DateTime.tryParse(
          message['roomExpiresAt'] as String? ?? '',
        );
        stage
          ..clear()
          ..addAll(Map<String, dynamic>.from(message['stage'] as Map? ?? {}));
        if (message['resumed'] != true) {
          tracks.clear();
          for (final raw in message['tracks'] as List? ?? []) {
            if (raw is Map) _rememberTrack(Map<String, dynamic>.from(raw));
          }
          unawaited(media.resetPeers());
        }
        _sendPresence(join: true);
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
        roomExpiresAt =
            DateTime.tryParse(message['roomExpiresAt'] as String? ?? '') ??
            roomExpiresAt;
        if (admission == 'denied') {
          unawaited(_signaling.close());
        } else {
          _sendPresence(join: true);
        }
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
      case 'room.settings':
        settings
          ..clear()
          ..addAll(
            Map<String, dynamic>.from(message['settings'] as Map? ?? {}),
          );
      case 'stage':
        stage
          ..clear()
          ..addAll(Map<String, dynamic>.from(message['stage'] as Map? ?? {}));
      case 'admission.approved':
        approved
          ..clear()
          ..addAll(
            (message['participants'] as List? ?? [])
                .whereType<Map<String, dynamic>>()
                .map(Map<String, dynamic>.from),
          );
      case 'reaction':
        reactions.add(message);
        if (reactions.length > 24) reactions.removeAt(0);
      case 'assistant.live':
        liveAssistantOwnerId = message['active'] == true
            ? message['ownerId'] as String?
            : null;
      case 'recording.state':
        recordingState = message['state'] as String? ?? 'idle';
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
          .then((_) {
            if (!_disposed && error == 'media') {
              error = null;
              notifyListeners();
            }
          })
          .catchError((Object _) {
            if (!_disposed) {
              error = 'media';
              notifyListeners();
            }
          }),
    );
  }

  Future<void> retryMedia() async {
    try {
      await media.resetPeers();
      if (_disposed) return;
      if (error == 'media') error = null;
      notifyListeners();
    } on Object {
      if (_disposed) return;
      error = 'media';
      notifyListeners();
    }
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
    try {
      await media.setAudioEnabled(enabled: enabled);
      _sendPresence();
    } on Object {
      error = 'media';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> setCamera({required bool enabled}) async {
    try {
      await media.setVideoEnabled(enabled: enabled);
      _sendPresence();
    } on Object {
      error = 'media';
      notifyListeners();
      rethrow;
    }
  }

  Future<String> sendMessage(String body) async {
    final text = body.trim();
    if (text.isEmpty) throw ArgumentError.value(body, 'body');
    final reply = await _signaling.request({
      'type': 'chat.message',
      'body': text,
    });
    final id = reply['id'] as String?;
    if (id == null) throw StateError('Meet chat receipt missing');
    if (MeetRoomAssistant.hasMention(text)) {
      unawaited(roomAssistant.ask(id));
    }
    return id;
  }

  void decideAdmission(String userId, {required bool admit}) {
    _signaling.send({
      'type': 'admission.decide',
      'userId': userId,
      'admit': admit,
    });
  }

  bool get handRaised =>
      (stage['raisedHandUserIds'] as List? ?? []).contains(selfUserId);

  bool isHandRaised(String userId) =>
      (stage['raisedHandUserIds'] as List? ?? []).contains(userId);

  bool get hasRecentReaction {
    if (reactions.isEmpty) return false;
    final at = DateTime.tryParse(reactions.last['createdAt'] as String? ?? '');
    return at != null &&
        at.isAfter(DateTime.now().subtract(const Duration(seconds: 5)));
  }

  String? recentReaction(String? userId) {
    if (userId == null) return null;
    final cutoff = DateTime.now().subtract(const Duration(seconds: 5));
    for (final reaction in reactions.reversed) {
      if (reaction['userId'] != userId) continue;
      final at = DateTime.tryParse(reaction['createdAt'] as String? ?? '');
      if (at == null || at.isBefore(cutoff)) return null;
      return reaction['reaction'] as String?;
    }
    return null;
  }

  void setHandRaised({required bool raised}) =>
      _signaling.send({'type': 'hand.raise', 'raised': raised});

  void react(String reaction) =>
      _signaling.send({'type': 'reaction.send', 'reaction': reaction});

  void updateSettings(Map<String, dynamic> patch) =>
      _signaling.send({'type': 'room.settings.update', 'settings': patch});

  void setRoomLocked({required bool locked}) => _signaling.send({
    'type': 'stage.update',
    'stage': {...stage, 'locked': locked},
  });

  void muteParticipant(String userId) => _signaling.send({
    'type': 'participant.mute',
    'userId': userId,
    'kinds': ['audio'],
  });

  void removeParticipant(String userId) =>
      _signaling.send({'type': 'participant.remove', 'userId': userId});

  void forgetApproval(String userId) =>
      _signaling.send({'type': 'admission.forget', 'userId': userId});

  Future<void> endRoom() async {
    if (role != 'host') throw StateError('Only the room host can end the call');
    await _signaling.request({'type': 'room.end'});
  }

  Future<Map<String, dynamic>> getRoomCosts() =>
      _repository.getRoomCosts(workspaceId, meetingId);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    media
      ..removeListener(_notify)
      ..dispose();
    roomAudio
      ..removeListener(_notify)
      ..dispose();
    personalChat.dispose();
    roomAssistant.dispose();
    unawaited(_signaling.close());
    if (_ownsRepository) _repository.dispose();
    super.dispose();
  }

  static String _newDeviceId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
}
