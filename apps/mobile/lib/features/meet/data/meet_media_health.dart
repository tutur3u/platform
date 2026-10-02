import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Screen and camera are both video tracks, but own distinct capture sources.
Set<String> stalledMeetCaptureKinds(
  Iterable<(String, MediaStreamTrack)> tracks,
  Set<String> stalled,
) => {
  for (final (name, track) in tracks)
    if (stalled.contains(name) && !name.endsWith('-screen')) track.kind ?? '',
};

int outgoingMeetPackets(Iterable<StatsReport> stats) => stats
    .where((entry) => entry.type == 'outbound-rtp')
    .fold<int>(0, (total, entry) {
      final value = entry.values['packetsSent'];
      return total +
          (value is num ? value.toInt() : int.tryParse('$value') ?? 0);
    });
