import 'package:mobile/features/notes/voice/notes_voice_job.dart';

/// Convert plain reviewed text into the same Tiptap format as existing Notes.
Map<String, dynamic> notesVoiceDocument(NotesVoiceJob job) {
  final artifact = job.artifact ?? const <String, dynamic>{};
  final paragraphs = <String>[
    if (artifact['summary'] is String) artifact['summary'] as String,
    ..._strings(artifact['decisions']),
    ..._objects(artifact['actionItems']).map(
      (item) => [
        item['task'],
        item['owner'],
        item['dueDate'],
        item['evidence'],
      ].whereType<String>().where((text) => text.isNotEmpty).join(' · '),
    ),
    ..._objects(artifact['recommendations']).map(
      (item) => [
        item['suggestion'],
        item['evidence'],
      ].whereType<String>().where((text) => text.isNotEmpty).join(' · '),
    ),
    ..._strings(artifact['openQuestions']),
    job.transcript ?? '',
  ];
  return {
    'type': 'doc',
    'content': paragraphs
        .where((text) => text.trim().isNotEmpty)
        .map(
          (text) => {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': text},
            ],
          },
        )
        .toList(),
  };
}

List<String> _strings(Object? value) =>
    value is List ? value.whereType<String>().toList() : const [];
List<Map<Object?, Object?>> _objects(Object? value) => value is List
    ? value.whereType<Map<Object?, Object?>>().toList()
    : const [];
