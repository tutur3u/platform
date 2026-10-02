import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Device-only fixture. Screen media travels between two local peers, never to
/// Cloudflare, a hosted meeting, or an external ICE/TURN service.
class MeetCaptureLoopback {
  RTCPeerConnection? _sender;
  RTCPeerConnection? _receiver;
  MediaStream? _remote;
  Future<void>? _closing;

  Future<void> start(MediaStream source, RTCVideoRenderer renderer) async {
    final sender = await createPeerConnection({'iceServers': <dynamic>[]});
    if (_closing != null) {
      await sender.close();
      throw StateError('Fixture stopped');
    }
    _sender = sender;
    final receiver = await createPeerConnection({'iceServers': <dynamic>[]});
    if (_closing != null) {
      await receiver.close();
      throw StateError('Fixture stopped');
    }
    _receiver = receiver;
    final forSender = <RTCIceCandidate>[];
    final forReceiver = <RTCIceCandidate>[];
    var senderReady = false;
    var receiverReady = false;
    sender.onIceCandidate = (candidate) {
      if (candidate.candidate?.isEmpty ?? true) return;
      if (receiverReady) {
        unawaited(receiver.addCandidate(candidate).catchError((Object _) {}));
      } else {
        forReceiver.add(candidate);
      }
    };
    receiver
      ..onIceCandidate = (candidate) {
        if (candidate.candidate?.isEmpty ?? true) return;
        if (senderReady) {
          unawaited(sender.addCandidate(candidate).catchError((Object _) {}));
        } else {
          forSender.add(candidate);
        }
      }
      ..onTrack = (event) {
        if (_closing == null && event.streams.isNotEmpty) {
          _remote = event.streams.first;
          renderer.srcObject = _remote;
        }
      };
    for (final track in source.getVideoTracks()) {
      await sender.addTrack(track, source);
    }
    final offer = await sender.createOffer();
    await sender.setLocalDescription(offer);
    await receiver.setRemoteDescription(offer);
    receiverReady = true;
    for (final candidate in forReceiver) {
      await receiver.addCandidate(candidate);
    }
    final answer = await receiver.createAnswer();
    await receiver.setLocalDescription(answer);
    await sender.setRemoteDescription(answer);
    senderReady = true;
    for (final candidate in forSender) {
      await sender.addCandidate(candidate);
    }
  }

  Future<int> decodedFrames() async {
    final receiver = _receiver;
    if (receiver == null) return 0;
    final reports = await receiver.getStats();
    var count = 0;
    for (final report in reports) {
      if (report.type != 'inbound-rtp') continue;
      final frames = report.values['framesDecoded'];
      if (frames is num) count += frames.toInt();
    }
    return count;
  }

  Future<void> close() => _closing ??= _close();
  Future<void> _close() async {
    _sender?.onIceCandidate = null;
    _receiver?.onIceCandidate = null;
    _receiver?.onTrack = null;
    try {
      await _sender?.close();
    } finally {
      try {
        await _receiver?.close();
      } finally {
        await _remote?.dispose();
      }
    }
    _sender = null;
    _receiver = null;
    _remote = null;
  }
}
