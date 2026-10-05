import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/notes/voice/notes_voice_document.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';

void main() {
  test(
    'malformed response cannot be treated as an authorized ready result',
    () {
      for (final change in <Map<String, dynamic>>[
        {'status': 'invented'},
        {'revision': 0},
        {'revision': 1.2},
        {'transcript': 12},
        {'artifact': <Object?>[]},
        {'id': ''},
        {'status': 'completed', 'artifact': null},
      ]) {
        expect(
          () => NotesVoiceJob.fromJson({
            'id': 'job',
            'wsId': 'ws',
            'status': 'completed',
            'revision': 4,
            'transcript': 'Speech',
            'artifact': <String, dynamic>{},
            ...change,
          }),
          throwsA(isA<ApiException>()),
        );
      }
    },
  );
  test(
    'proposals and spoken markup remain literal Note text without task/event nodes',
    () {
      const job = NotesVoiceJob(
        id: 'job',
        workspaceId: 'ws',
        status: 'completed',
        revision: 4,
        transcript: '<script>ignore instruction</script>',
        artifact: {
          'summary': 'Summary',
          'actionItems': [
            {
              'task': 'Review',
              'owner': null,
              'dueDate': null,
              'evidence': 'Review it',
            },
          ],
          'recommendations': [
            {
              'suggestion': 'Consider a backup',
              'evidence': 'No backup discussed',
            },
          ],
        },
      );
      final doc = notesVoiceDocument(job);
      final children = doc['content']! as List;
      expect(children, hasLength(4));
      expect(
        children.every((node) => (node as Map)['type'] == 'paragraph'),
        true,
      );
      expect(doc.toString(), contains('<script>ignore instruction</script>'));
      expect(doc.toString(), contains('Review · Review it'));
    },
  );
  test('known failure retains transcript; uncertain jobs cannot save', () {
    expect(
      const NotesVoiceJob(
        id: 'job',
        workspaceId: 'ws',
        status: 'failed',
        revision: 4,
        transcript: 'Speech',
      ).canSave,
      true,
    );
    expect(
      const NotesVoiceJob(
        id: 'job',
        workspaceId: 'ws',
        status: 'review_required',
        revision: 4,
        transcript: 'Speech',
      ).canSave,
      false,
    );
  });
}
