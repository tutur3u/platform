import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Cloudflare needs the gathered local SDP, including ICE candidates, before
/// either side sends its offer or answer to the room server.
Future<RTCSessionDescription> gatheredLocalDescription(
  RTCPeerConnection peer,
) async {
  // A STUN lookup can leave gathering in progress indefinitely on some iOS
  // networks. Bound the wait and send candidates gathered so far, provided
  // the local description contains at least one usable candidate.
  final deadline = DateTime.now().add(const Duration(seconds: 3));
  while (DateTime.now().isBefore(deadline)) {
    if (await peer.getIceGatheringState() ==
        RTCIceGatheringState.RTCIceGatheringStateComplete) {
      break;
    }
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  final description = await peer.getLocalDescription();
  if (description?.sdp == null || description!.sdp!.isEmpty) {
    throw StateError('Local media description is missing');
  }
  if (_candidateCount(description.sdp) == 0) {
    throw TimeoutException('No local ICE candidates were gathered');
  }
  return description;
}

/// Later track changes must wait for the prior offer/answer to connect.
Future<void> waitForMeetPeerConnection(RTCPeerConnection peer) async {
  try {
    await _waitForState(
      isReady: () async {
        final state = await peer.getConnectionState();
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
          throw StateError('Media connection failed');
        }
        return state == RTCPeerConnectionState.RTCPeerConnectionStateConnected;
      },
      timeoutMessage: 'Media connection timed out',
    );
  } on TimeoutException {
    final local = await peer.getLocalDescription();
    final remote = await peer.getRemoteDescription();
    // Log only connection states and candidate counts, never SDP or ICE keys.
    throw TimeoutException(
      'Media connection timed out '
      '(state: ${await peer.getConnectionState()}, '
      'ice: ${await peer.getIceConnectionState()}, '
      'gathering: ${await peer.getIceGatheringState()}, '
      'local candidates: ${_candidateCount(local?.sdp)}, '
      'remote candidates: ${_candidateCount(remote?.sdp)})',
    );
  }
}

int _candidateCount(String? sdp) => sdp == null
    ? 0
    : RegExp('^a=candidate:', multiLine: true).allMatches(sdp).length;

Future<void> _waitForState({
  required Future<bool> Function() isReady,
  required String timeoutMessage,
}) async {
  final deadline = DateTime.now().add(const Duration(seconds: 12));
  while (DateTime.now().isBefore(deadline)) {
    if (await isReady()) return;
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  throw TimeoutException(timeoutMessage);
}
