import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_controls.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/features/notes/voice/notes_voice_review.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

class Capture extends Mock implements AssistantVoiceCaptureCubit {}

void main() {
  testWidgets(
    'capture controls drive pause, retake and cancel without another dock',
    (tester) async {
      final capture = Capture();
      when(capture.pause).thenAnswer((_) async {});
      when(capture.restart).thenAnswer((_) async {});
      when(capture.cancel).thenAnswer((_) async {});
      await tester.pumpApp(
        Scaffold(
          body: SizedBox(
            width: 320,
            height: 80,
            child: NotesVoiceControls(
              capture: capture,
              state: const AssistantVoiceCaptureState(
                status: AssistantVoiceCaptureStatus.recording,
                seconds: 12,
                levels: [.1, .7, .2],
              ),
              onCancel: capture.cancel,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('0:12'), findsOneWidget);
      final paint = tester.widget<CustomPaint>(
        find.byKey(const ValueKey('notes-voice-waveform')),
      );
      expect((paint.painter! as NotesWaveformPainter).levels, [.1, .7, .2]);
      await tester.tap(find.byTooltip('Pause recording'));
      await tester.pumpAndSettle();
      verify(capture.pause).called(1);
      await tester.pumpApp(
        Scaffold(
          body: SizedBox(
            width: 320,
            height: 80,
            child: NotesVoiceControls(
              capture: capture,
              state: const AssistantVoiceCaptureState(
                status: AssistantVoiceCaptureStatus.paused,
                seconds: 12,
              ),
              onCancel: capture.cancel,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Record again'));
      await tester.pumpAndSettle();
      verify(capture.restart).called(1);
      await tester.tap(find.byTooltip('Cancel'));
      await tester.pumpAndSettle();
      verify(capture.cancel).called(1);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'review at enlarged text shows evidence and saves only on explicit tap',
    (tester) async {
      var saves = 0;
      const job = NotesVoiceJob(
        id: 'job',
        workspaceId: 'ws',
        status: 'completed',
        revision: 4,
        transcript: 'Discuss the release',
        artifact: {
          'summary': 'Discuss release readiness.',
          'actionItems': [
            {
              'task': 'Review deployment',
              'owner': null,
              'dueDate': null,
              'evidence': 'Discuss the release',
            },
          ],
        },
      );
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: NotesVoiceReview(job: job, onSave: () => saves++),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(saves, 0);
      expect(find.text('Summary'), findsOneWidget);
      expect(find.textContaining('Team workspace notes'), findsOneWidget);
      await tester.tap(find.text('Save note to this workspace'));
      await tester.pumpAndSettle();
      expect(saves, 1);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('silent result cannot be saved as an invented note', (
    tester,
  ) async {
    var saves = 0;
    await tester.pumpApp(
      NotesVoiceReview(
        job: const NotesVoiceJob(
          id: 'job',
          workspaceId: 'ws',
          status: 'completed',
          revision: 4,
          transcript: '',
          artifact: {},
        ),
        onSave: () => saves++,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save note to this workspace'));
    await tester.pumpAndSettle();
    expect(saves, 0);
    expect(
      find.text('No speech was detected. Record again when ready.'),
      findsOneWidget,
    );
  });
}
