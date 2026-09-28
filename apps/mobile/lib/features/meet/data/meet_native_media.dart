import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/features/meet/data/meet_peer_negotiation.dart';
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
  String? _lastSubscribeSummary;
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
  String? failureStage;

  Future<void> initialize() async {
    await localRenderer.initialize();
  }

  Future<void> setAudioEnabled({required bool enabled}) => _serialize(() async {
    if (enabled && _audio == null) {
      await _captureAudio();
    }
    _audio?.enabled = enabled;
    audioEnabled = enabled;
    notifyListeners();
    await _publishPending();
    failureStage = null;
  });

  Future<void> setVideoEnabled({required bool enabled}) => _serialize(() async {
    if (enabled && _video == null) {
      await _captureVideo();
    }
    _video?.enabled = enabled;
    videoEnabled = enabled;
    notifyListeners();
    await _publishPending();
    failureStage = null;
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
    if (_participants != participants) {
      debugPrint(
        'Meet media participants=$participants audio=$audioEnabled '
        'video=$videoEnabled remoteTracks=${tracks.length}',
      );
    }
    _selfUserId = selfUserId;
    _participants = participants;
    _admitted = admitted;
    _remoteTracks = tracks;
    if (!_admitted) return;
    Object? captureFailure;
    if (_participants >= 2) {
      if (audioEnabled && _audio == null) {
        try {
          await _captureAudio();
        } on Object catch (error) {
          captureFailure = error;
        }
      }
      if (videoEnabled && _video == null) {
        try {
          await _captureVideo();
        } on Object catch (error) {
          captureFailure ??= error;
        }
      }
    }
    await _publishPending();
    await _subscribePending();
    if (captureFailure != null) {
      failureStage = 'capture';
      throw StateError('Local media capture failed: $captureFailure');
    }
    failureStage = null;
  });

  Future<void> resetPeers() => _serialize(() async {
    await _resetPublisher();
    await _resetSubscriber();
    failureStage = null;
  });

  Future<void> resetReceiver() => _serialize(() async {
    await _resetSubscriber();
    failureStage = null;
  });

  Future<void> _resetPublisher() async {
    final peer = _publisher;
    final session = _publishSession;
    _publisher = null;
    _publishSession = null;
    _published.clear();
    if (session != null) {
      signaling.send({'type': 'media.idle', 'sessionId': session});
    }
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

  Future<void> _captureAudio() async {
    failureStage = 'capture';
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

  Future<void> _captureVideo() async {
    failureStage = 'capture';
    MediaStream stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
          'facingMode': 'user',
          'width': 1280,
          'height': 720,
          'frameRate': 24,
        },
      });
    } on Object {
      // A device may support the front camera without this exact capture mode.
      stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {'facingMode': 'user'},
      });
    }
    _streams.add(stream);
    _video = stream.getVideoTracks().first;
    localRenderer.srcObject = stream;
  }

  Future<void> _discardLocalCapture({required Set<String> kinds}) async {
    final audioId = kinds.contains('audio') ? _audio?.id : null;
    final videoId = kinds.contains('video') ? _video?.id : null;
    if (audioId != null) _audio = null;
    if (videoId != null) {
      _video = null;
      localRenderer.srcObject = null;
    }
    final streams = _streams.where((stream) {
      return stream.getTracks().any(
        (track) => track.id == audioId || track.id == videoId,
      );
    }).toList();
    _streams.removeWhere(streams.contains);
    for (final stream in streams) {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      await stream.dispose();
    }
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
      'bundlePolicy': 'max-bundle',
      'iceServers': [
        {'urls': 'stun:stun.cloudflare.com:3478'},
      ],
    });
    try {
      failureStage = 'session';
      final response = await signaling.request({'type': 'sfu.session.create'});
      final id = response['sessionId'] as String?;
      if (id == null) throw StateError('SFU session unavailable');
      final ice = response['iceServers'];
      if (ice is List) {
        await pc.setConfiguration({
          'bundlePolicy': 'max-bundle',
          'iceServers': ice,
        });
      }
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
    debugPrint('Meet publisher starting ${pending.length} local tracks');
    final (pc, sessionId) = await _openSession(publish: true);
    var stalledKinds = <String>{};
    try {
      failureStage = 'publish';
      if (await pc.getRemoteDescription() != null) {
        await waitForMeetPeerConnection(pc);
      }
      final transceivers = <(String, MediaStreamTrack, RTCRtpTransceiver)>[];
      for (final (name, track) in pending) {
        final transceiver = await pc.addTransceiver(
          track: track,
          init: RTCRtpTransceiverInit(direction: TransceiverDirection.SendOnly),
        );
        transceivers.add((name, track, transceiver));
      }
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      failureStage = 'connect';
      final localDescription = await gatheredLocalDescription(pc);
      failureStage = 'publish';
      // flutter_webrtc snapshots MID when addTransceiver returns. Read the
      // negotiated transceivers again after setLocalDescription. The iOS
      // transceiver ID itself changes with MID, so match stable sender IDs.
      final negotiated = {
        for (final transceiver in await pc.getTransceivers())
          transceiver.sender.senderId: transceiver.mid,
      };
      final publications = <Map<String, String>>[];
      for (final (name, track, transceiver) in transceivers) {
        final mid = negotiated[transceiver.sender.senderId];
        final kind = track.kind;
        if (mid == null || mid.isEmpty) {
          throw StateError('SFU track has no negotiated MID: $name');
        }
        if (kind == null || kind.isEmpty) {
          throw StateError('SFU track has no media kind: $name');
        }
        publications.add({
          'location': 'local',
          'mid': mid,
          'trackName': name,
          'kind': kind,
        });
      }
      final response = await signaling.request({
        'type': 'sfu.tracks.publish',
        'sessionId': sessionId,
        'sessionDescription': {'type': 'offer', 'sdp': localDescription.sdp},
        'tracks': publications,
      });
      if (response['errorCode'] != null) throw StateError('SFU publish failed');
      final answer = Map<String, dynamic>.from(
        response['sessionDescription'] as Map? ?? {},
      );
      if (answer['sdp'] is! String) throw StateError('SFU answer missing');
      await pc.setRemoteDescription(
        RTCSessionDescription(answer['sdp'] as String, 'answer'),
      );
      failureStage = 'connect';
      await waitForMeetPeerConnection(pc);
      final stalled = await _waitForOutgoingPackets(
        transceivers.map((entry) => (entry.$1, entry.$3.sender)),
      );
      if (stalled.isNotEmpty) {
        stalledKinds = {
          for (final (name, track, _) in transceivers)
            if (stalled.contains(name)) track.kind ?? '',
        };
        failureStage = 'send';
        throw StateError('Local media capture is not sending packets');
      }
      _published.addAll(pending.map((entry) => entry.$1));
      final hasAudio = pending.any((entry) => entry.$2.kind == 'audio');
      final hasVideo = pending.any((entry) => entry.$2.kind == 'video');
      MobileObservability.instance.logMeetEvent(
        'meet_media_published',
        media: hasAudio && hasVideo
            ? 'audio_video'
            : hasAudio
            ? 'audio'
            : hasVideo
            ? 'video'
            : 'unknown',
      );
      debugPrint(
        'Meet publisher connected with ${pending.length} local tracks',
      );
    } on Object {
      await _resetPublisher();
      if (failureStage == 'send') {
        await _discardLocalCapture(kinds: stalledKinds);
      }
      rethrow;
    }
  }

  Future<Set<String>> _waitForOutgoingPackets(
    Iterable<(String, RTCRtpSender)> senders,
  ) async {
    final stalled = {for (final (name, _) in senders) name};
    final deadline = DateTime.now().add(const Duration(seconds: 5));
    do {
      for (final (name, sender) in senders) {
        if (!stalled.contains(name)) continue;
        final stats = await sender.getStats().timeout(
          const Duration(seconds: 2),
        );
        final packets = stats
            .where((entry) => entry.type == 'outbound-rtp')
            .fold<int>(0, (total, entry) {
              final value = entry.values['packetsSent'];
              return total +
                  (value is num ? value.toInt() : int.tryParse('$value') ?? 0);
            });
        if (packets > 0) stalled.remove(name);
      }
      if (stalled.isEmpty) return stalled;
      if (DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 300));
      }
    } while (DateTime.now().isBefore(deadline));
    debugPrint(
      'Meet publisher connected but did not send ${stalled.join(',')}; '
      'audioMuted=${_audio?.muted} videoMuted=${_video?.muted}',
    );
    return stalled;
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
      failureStage = 'receive';
      if (await pc.getRemoteDescription() != null) {
        await waitForMeetPeerConnection(pc);
      }
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
      final resultTracks = response['tracks'] as List? ?? [];
      final summary = resultTracks
          .map((value) {
            if (value is! Map) return 'invalid';
            return '${value['errorCode'] ?? 'ok'}:'
                '${value['mid'] != null}:${value['trackName'] != null}';
          })
          .join(',');
      if (_lastSubscribeSummary != summary) {
        _lastSubscribeSummary = summary;
        debugPrint('Meet subscribe results: $summary');
        if (resultTracks.any(
          (value) => value is Map && value['errorCode'] != null,
        )) {
          await _logPublisherHealth();
        }
      }
      var accepted = 0;
      for (final value in resultTracks) {
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
        accepted++;
      }
      if (accepted == 0) throw StateError('SFU accepted no remote tracks');
      final offer = Map<String, dynamic>.from(
        response['sessionDescription'] as Map? ?? {},
      );
      if (offer['sdp'] is String) {
        await pc.setRemoteDescription(
          RTCSessionDescription(offer['sdp'] as String, 'offer'),
        );
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        failureStage = 'connect';
        final localDescription = await gatheredLocalDescription(pc);
        failureStage = 'receive';
        final answerResponse = await signaling.request({
          'type': 'sfu.renegotiate',
          'sessionId': sessionId,
          'sessionDescription': {'type': 'answer', 'sdp': localDescription.sdp},
        });
        if (answerResponse['errorCode'] != null) {
          throw StateError('SFU negotiation failed');
        }
        failureStage = 'connect';
        await waitForMeetPeerConnection(pc);
      } else {
        throw StateError('SFU remote offer missing');
      }
    } on Object {
      await _resetSubscriber();
      rethrow;
    }
  }

  Future<void> _logPublisherHealth() async {
    final publisher = _publisher;
    if (publisher == null) return;
    try {
      final stats = await publisher.getStats().timeout(
        const Duration(seconds: 2),
      );
      final outbound = stats.where((entry) => entry.type == 'outbound-rtp');
      final packets = outbound.fold<int>(0, (total, entry) {
        final value = entry.values['packetsSent'];
        return total +
            (value is num ? value.toInt() : int.tryParse('$value') ?? 0);
      });
      debugPrint(
        'Meet publisher health: state=${await publisher.getConnectionState()} '
        'outboundStreams=${outbound.length} packetsSent=$packets '
        'audioEnabled=${_audio?.enabled} audioMuted=${_audio?.muted} '
        'videoEnabled=${_video?.enabled} videoMuted=${_video?.muted}',
      );
    } on Object {
      // Diagnostics must never interrupt a media retry.
    }
  }

  void _receiveTrack(RTCTrackEvent event) {
    final generation = _receiveGeneration;
    unawaited(
      _serialize(() async {
        var mid = event.transceiver?.mid;
        if (mid == null || mid.isEmpty || !_midOwners.containsKey(mid)) {
          final id = event.receiver?.receiverId;
          if (id != null && _subscriber != null) {
            for (final transceiver in await _subscriber!.getTransceivers()) {
              if (transceiver.receiver.receiverId == id) {
                mid = transceiver.mid;
                break;
              }
            }
          }
        }
        final owner = _midOwners[mid];
        if (owner == null) {
          debugPrint('Meet remote track has no participant for MID $mid');
          return;
        }
        await _showRemoteTrack(owner, event, generation);
      }).catchError((Object error) {
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
    MobileObservability.instance.logMeetEvent(
      'meet_media_received',
      media: event.track.kind ?? 'unknown',
    );
    if (event.track.kind == 'audio') {
      try {
        await Helper.setSpeakerphoneOn(true);
      } on Object {
        // Playback still follows the current OS route if speaker routing fails.
      }
    }
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
