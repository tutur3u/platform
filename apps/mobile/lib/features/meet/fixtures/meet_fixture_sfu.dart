import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_peer_negotiation.dart';

/// Synthetic SFU contract: receives the production publisher's actual media.
/// It deliberately does not emulate Cloudflare routing, TURN or billing.
class MeetFixtureSfu {
  MeetFixtureSfu(this.renderer);
  final RTCVideoRenderer renderer;
  final _sessions = <String, RTCPeerConnection>{};
  final _streams = <String, MediaStream>{};
  var _next = 0;
  bool _closed = false;

  Future<Map<String, dynamic>> request(Map<String, dynamic> message) async {
    if (_closed) throw StateError('Fixture SFU closed');
    final type = message['type'];
    if (type == 'sfu.session.create') {
      if (_sessions.length >= 8) throw StateError('Fixture session limit');
      final peer = await createPeerConnection({
        'sdpSemantics': 'unified-plan',
        'bundlePolicy': 'max-bundle',
        'iceServers': <dynamic>[],
      });
      if (_closed) {
        await peer.dispose();
        throw StateError('Fixture SFU closed');
      }
      final id = 'fixture-${++_next}';
      final stream = await createLocalMediaStream(id);
      if (_closed) {
        await stream.dispose();
        await peer.dispose();
        throw StateError('Fixture SFU closed');
      }
      _streams[id] = stream;
      peer.onTrack = (event) {
        unawaited(
          stream
              .addTrack(event.track)
              .then((_) {
                if (!_closed && _sessions[id] == peer) {
                  renderer.srcObject = stream;
                }
              })
              .catchError((Object _) {}),
        );
      };
      _sessions[id] = peer;
      return {'sessionId': id, 'iceServers': <dynamic>[]};
    }
    final peer = _sessions[message['sessionId']];
    if (peer == null) throw StateError('Unknown fixture session');
    if (type == 'sfu.tracks.publish') {
      final description = message['sessionDescription'];
      if (description is! Map ||
          description['type'] != 'offer' ||
          description['sdp'] is! String ||
          (description['sdp'] as String).length > 65536) {
        throw const FormatException('Invalid fixture offer');
      }
      await peer.setRemoteDescription(
        RTCSessionDescription(description['sdp'] as String, 'offer'),
      );
      await peer.setLocalDescription(await peer.createAnswer());
      final answer = await gatheredLocalDescription(peer);
      return {
        'sessionDescription': {'type': 'answer', 'sdp': answer.sdp},
      };
    }
    throw StateError('Unsupported fixture SFU operation');
  }

  Future<int> decodedFrames() async {
    var count = 0;
    for (final peer in _sessions.values.toList()) {
      for (final report in await peer.getStats()) {
        if (report.type != 'inbound-rtp') continue;
        final frames = report.values['framesDecoded'];
        if (frames is num) count += frames.toInt();
      }
    }
    return count;
  }

  Future<void> idle(String id) async {
    final peer = _sessions.remove(id);
    if (peer == null) return;
    renderer.srcObject = null;
    peer.onTrack = null;
    try {
      await peer.dispose();
    } finally {
      await _streams.remove(id)?.dispose();
    }
  }

  Future<void> close() async {
    _closed = true;
    await reset();
  }

  Future<void> reset() async {
    for (final id in _sessions.keys.toList()) {
      await idle(id);
    }
  }
}
