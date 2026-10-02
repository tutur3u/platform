import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/view/meet_participant_tile.dart';
import 'package:mocktail/mocktail.dart';

class _Stream extends Mock implements MediaStream {}

class _Track extends Mock implements MediaStreamTrack {}

class _Renderer extends RTCVideoRenderer {
  _Renderer(this.stream);
  final MediaStream stream;
  @override
  MediaStream get srcObject => stream;
}

void main() {
  testWidgets(
    'shows a raised hand and recent reaction over participant media',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 240,
              height: 180,
              child: MeetParticipantTile(
                name: 'Taylor',
                microphoneOn: true,
                handRaised: true,
                reaction: 'clap',
              ),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.back_hand), findsOneWidget);
      expect(find.byIcon(Icons.front_hand), findsOneWidget);
      expect(find.text('Taylor'), findsOneWidget);
    },
  );
  for (final screen in [true, false]) {
    testWidgets('local video fit and mirroring screen=$screen', (tester) async {
      final stream = _Stream();
      when(stream.getVideoTracks).thenReturn([_Track()]);
      final renderer = _Renderer(stream);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 240,
              height: 180,
              child: MeetParticipantTile(
                name: 'Synthetic',
                microphoneOn: true,
                local: true,
                screen: screen,
                renderer: renderer,
              ),
            ),
          ),
        ),
      );
      final video = tester.widget<RTCVideoView>(find.byType(RTCVideoView));
      expect(
        video.objectFit,
        screen
            ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
            : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      );
      expect(video.mirror, !screen);
      await tester.pumpWidget(const SizedBox());
      await renderer.dispose();
    });
  }
}
