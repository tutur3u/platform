import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_signaling.dart';

typedef MeetRoomTrack = Map<String, dynamic>;

/// Native capture and Cloudflare SFU transport. The room server owns SFU keys.
class MeetNativeMedia extends ChangeNotifier {
  MeetNativeMedia(this.signaling);

  final MeetSignaling signaling;
  final localRenderer = RTCVideoRenderer();
  final remoteRenderers = <String, RTCVideoRenderer>{};
  final _remoteStreams = <String, MediaStream>{};
  final _remoteTrackIds = <String, Set<String>>{};
  final _midOwners = <String, String>{};
  final _subscribed = <String>{};
  final _published = <String>{};
  final _streams = <MediaStream>[];
  RTCPeerConnection? _publisher;
  RTCPeerConnection? _subscriber;
  String? _publishSession;
  String? _subscribeSession;
  MediaStreamTrack? _audio;
  MediaStreamTrack? _video;
  String? _selfUserId;
  List<MeetRoomTrack> _remoteTracks = [];
  var _participants = 0;
  var _admitted = false;
  var _disposed = false;
  var _receiveGeneration = 0;
  Future<void> _queue = Future<void>.value();

  bool audioEnabled = false;
  bool videoEnabled = false;

  Future<void> initialize() async {
    await localRenderer.initialize();
  }

  Future<void> setAudioEnabled({required bool enabled}) => _serialize(() async {
    if (enabled && _audio == null) {
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });
      _streams.add(stream);
      _audio = stream.getAudioTracks().first;
      try {
        await Helper.setSpeakerphoneOn(true);
      } on Object {
        // Audio capture can still work when the OS keeps its current route.
      }
    }
    _audio?.enabled = enabled;
    audioEnabled = enabled;
    notifyListeners();
    await _publishPending();
  });

  Future<void> setVideoEnabled({required bool enabled}) => _serialize(() async {
    if (enabled && _video == null) {
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
          'frameRate': {'ideal': 24},
        },
      });
      _streams.add(stream);
      _video = stream.getVideoTracks().first;
      localRenderer.srcObject = stream;
    }
    _video?.enabled = enabled;
    videoEnabled = enabled;
    notifyListeners();
    await _publishPending();
  });

  Future<void> switchCamera() async {
    final video = _video;
    if (video != null) await Helper.switchCamera(video);
  }

  Future<void> updateRoom({
    required String? selfUserId,
    required int participants,
    required bool admitted,
    required List<MeetRoomTrack> tracks,
  }) => _serialize(() async {
    _selfUserId = selfUserId;
    _participants = participants;
    _admitted = admitted;
    _remoteTracks = tracks;
    if (!_admitted) return;
    await _publishPending();
    await _subscribePending();
  });

  Future<void> resetPeers() => _serialize(() async {
    await _resetPublisher();
    await _resetSubscriber();
    await _publishPending();
    await _subscribePending();
  });

  Future<void> _resetPublisher() async {
    final peer = _publisher;
    _publisher = null;
    _publishSession = null;
    _published.clear();
    await peer?.dispose();
  }

  Future<void> _resetSubscriber() async {
    _receiveGeneration++;
    final peer = _subscriber;
    _subscriber = null;
    _subscribeSession = null;
    _subscribed.clear();
    _midOwners.clear();
    await peer?.dispose();
    for (final renderer in remoteRenderers.values) {
      await renderer.dispose();
    }
    remoteRenderers.clear();
    for (final stream in _remoteStreams.values) {
      await stream.dispose();
    }
    _remoteStreams.clear();
    _remoteTrackIds.clear();
    notifyListeners();
  }

  Future<void> _serialize(Future<void> Function() action) {
    final operation = _queue.then((_) async {
      if (!_disposed) await action();
    });
    _queue = operation.catchError((Object _) {});
    return operation;
  }

  Future<(RTCPeerConnection, String)> _openSession({
    required bool publish,
  }) async {
    final current = publish ? _publisher : _subscriber;
    final session = publish ? _publishSession : _subscribeSession;
    if (current != null && session != null) return (current, session);
    final pc = await createPeerConnection({
      'sdpSemantics': 'unified-plan',
      'iceServers': [
        {'urls': 'stun:stun.cloudflare.com:3478'},
      ],
    });
    try {
      final response = await signaling.request({'type': 'sfu.session.create'});
      final id = response['sessionId'] as String?;
      if (id == null) throw StateError('SFU session unavailable');
      final ice = response['iceServers'];
      if (ice is List) await pc.setConfiguration({'iceServers': ice});
      if (publish) {
        _publisher = pc;
        _publishSession = id;
      } else {
        pc.onTrack = _receiveTrack;
        _subscriber = pc;
        _subscribeSession = id;
      }
      return (pc, id);
    } on Object {
      await pc.dispose();
      rethrow;
    }
  }

  Future<void> _publishPending() async {
    final self = _selfUserId;
    if (!_admitted || _participants < 2 || self == null) return;
    final pending = <(String, MediaStreamTrack)>[
      if (audioEnabled && _audio != null && !_published.contains('$self-audio'))
        ('$self-audio', _audio!),
      if (videoEnabled && _video != null && !_published.contains('$self-video'))
        ('$self-video', _video!),
    ];
    if (pending.isEmpty) return;
    final (pc, sessionId) = await _openSession(publish: true);
    try {
      final transceivers = <(String, RTCRtpTransceiver)>[];
      for (final (name, track) in pending) {
        final transceiver = await pc.addTransceiver(
          track: track,
          init: RTCRtpTransceiverInit(direction: TransceiverDirection.SendOnly),
        );
        transceivers.add((name, transceiver));
      }
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      final response = await signaling.request({
        'type': 'sfu.tracks.publish',
        'sessionId': sessionId,
        'sessionDescription': {'type': 'offer', 'sdp': offer.sdp},
        'tracks': [
          for (final (name, transceiver) in transceivers)
            {'location': 'local', 'mid': transceiver.mid, 'trackName': name},
        ],
      });
      if (response['errorCode'] != null) throw StateError('SFU publish failed');
      final answer = Map<String, dynamic>.from(
        response['sessionDescription'] as Map? ?? {},
      );
      if (answer['sdp'] is! String) throw StateError('SFU answer missing');
      await pc.setRemoteDescription(
        RTCSessionDescription(answer['sdp'] as String, 'answer'),
      );
      _published.addAll(pending.map((entry) => entry.$1));
    } on Object {
      await _resetPublisher();
      rethrow;
    }
  }

  Future<void> _subscribePending() async {
    if (!_admitted || _participants < 2) return;
    final self = _selfUserId;
    final pending = <MeetRoomTrack>[];
    for (final track in _remoteTracks.reversed) {
      final name = track['trackName'] as String?;
      final session = track['sessionId'] as String?;
      if (name == null || session == null || track['userId'] == self) continue;
      final key = '$session:$name';
      if (!_subscribed.contains(key) &&
          !pending.any((existing) => existing['trackName'] == name)) {
        pending.add(track);
      }
    }
    if (pending.isEmpty) return;
    final (pc, sessionId) = await _openSession(publish: false);
    try {
      final response = await signaling.request({
        'type': 'sfu.tracks.subscribe',
        'sessionId': sessionId,
        'tracks': [
          for (final track in pending)
            {
              'location': 'remote',
              'sessionId': track['sessionId'],
              'trackName': track['trackName'],
            },
        ],
      });
      if (response['errorCode'] != null) {
        throw StateError('SFU subscribe failed');
      }
      for (final value in response['tracks'] as List? ?? []) {
        if (value is! Map || value['errorCode'] != null) continue;
        final mid = value['mid'] as String?;
        final name = value['trackName'] as String?;
        if (mid == null || name == null) continue;
        final owner = pending
            .where((track) => track['trackName'] == name)
            .firstOrNull;
        if (owner == null) continue;
        _midOwners[mid] = owner['userId'] as String;
        _subscribed.add('${owner['sessionId']}:$name');
      }
      final offer = Map<String, dynamic>.from(
        response['sessionDescription'] as Map? ?? {},
      );
      if (offer['sdp'] is String) {
        await pc.setRemoteDescription(
          RTCSessionDescription(offer['sdp'] as String, 'offer'),
        );
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signaling.request({
          'type': 'sfu.renegotiate',
          'sessionId': sessionId,
          'sessionDescription': {'type': 'answer', 'sdp': answer.sdp},
        });
      }
    } on Object {
      await _resetSubscriber();
      rethrow;
    }
  }

  void _receiveTrack(RTCTrackEvent event) {
    final owner = _midOwners[event.transceiver?.mid];
    if (owner == null) return;
    final generation = _receiveGeneration;
    unawaited(
      _serialize(() => _showRemoteTrack(owner, event, generation)).catchError((
        Object error,
      ) {
        debugPrint('Meet remote track render failed: $error');
      }),
    );
  }

  Future<void> _showRemoteTrack(
    String owner,
    RTCTrackEvent event,
    int generation,
  ) async {
    if (_disposed) return;
    final renderer = remoteRenderers[owner] ?? RTCVideoRenderer();
    if (!remoteRenderers.containsKey(owner)) await renderer.initialize();
    if (_disposed || generation != _receiveGeneration) {
      await renderer.dispose();
      return;
    }
    final stream =
        _remoteStreams[owner] ??
        await createLocalMediaStream('meet-remote-$owner');
    if (_disposed || generation != _receiveGeneration) {
      if (!_remoteStreams.containsKey(owner)) await stream.dispose();
      if (!remoteRenderers.containsKey(owner)) await renderer.dispose();
      return;
    }
    _remoteStreams[owner] = stream;
    final ids = _remoteTrackIds.putIfAbsent(owner, () => <String>{});
    final trackId = event.track.id;
    if (trackId == null || ids.add(trackId)) {
      await stream.addTrack(event.track);
    }
    renderer.srcObject = stream;
    remoteRenderers[owner] = renderer;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_release());
    super.dispose();
  }

  Future<void> _release() async {
    await _queue;
    await _publisher?.dispose();
    await _subscriber?.dispose();
    for (final stream in _streams) {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      await stream.dispose();
    }
    for (final renderer in remoteRenderers.values) {
      await renderer.dispose();
    }
    for (final stream in _remoteStreams.values) {
      await stream.dispose();
    }
    await localRenderer.dispose();
  }
}
