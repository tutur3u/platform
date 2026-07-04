import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_video_embed_builder.dart';

import '../../../helpers/pump_app.dart';

void main() {
  group('TaskDescriptionVideoPreview', () {
    testWidgets('renders a deferred preview before loading the player', (
      tester,
    ) async {
      await tester.pumpApp(
        const Material(
          child: TaskDescriptionVideoPreview(
            url: 'https://cdn.example.com/task-video.mp4',
          ),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });
  });
}
