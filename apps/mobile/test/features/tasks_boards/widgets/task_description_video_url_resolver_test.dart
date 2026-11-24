import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_video_url_resolver.dart';

void main() {
  test('public storage videos play as-is on any storage host', () async {
    for (final url in [
      'https://cdn.tuturuuu.com/task-media/ws/clip.mp4',
      'https://project.supabase.co/storage/v1/object/public/task-media/ws/clip.mp4',
      'https://storage.example.test/storage/v1/object/public/task-media/c.mp4',
    ]) {
      expect(await resolveTaskDescriptionVideoUrl(url, null), url);
    }
  });
}
