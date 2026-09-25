import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Cloudflare needs the gathered local SDP, including ICE candidates, before
/// either side sends its offer or answer to the room server.
Future<RTCSessionDescription> gatheredLocalDescription(
  RTCPeerConnection peer,
) async {
  await _waitForState(
    isReady: () async {
      final state = await peer.getIceGatheringState();
      return state == RTCIceGatheringState.RTCIceGatheringStateComplete;
    },
    timeoutMessage: 'ICE candidate gathering timed out',
  );
  final description = await peer.getLocalDescription();
  if (description?.sdp == null || description!.sdp!.isEmpty) {
    throw StateError('Local media description is missing');
  }
  return description;
}

/// Later track changes must wait for the prior offer/answer to connect.
Future<void> waitForMeetPeerConnection(RTCPeerConnection peer) => _waitForState(
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
