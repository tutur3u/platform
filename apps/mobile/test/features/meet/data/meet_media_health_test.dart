import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_media_health.dart';
import 'package:mocktail/mocktail.dart';

class _Track extends Mock implements MediaStreamTrack {}

void main() {
  test('stalled screen never discards camera capture', () {
    final camera = _Track();
    final screen = _Track();
    when(() => camera.kind).thenReturn('video');
    when(() => screen.kind).thenReturn('video');
    final tracks = [('synthetic-video', camera), ('synthetic-screen', screen)];
    expect(stalledMeetCaptureKinds(tracks, {'synthetic-screen'}), isEmpty);
    expect(stalledMeetCaptureKinds(tracks, {'synthetic-video'}), {'video'});
  });
}
