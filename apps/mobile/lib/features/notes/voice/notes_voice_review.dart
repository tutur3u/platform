import 'package:flutter/material.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

class NotesVoiceReview extends StatelessWidget {
  const NotesVoiceReview({
    required this.job,
    required this.onSave,
    this.saving = false,
    super.key,
  });
  final NotesVoiceJob job;
  final VoidCallback onSave;
  final bool saving;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final artifact = job.artifact ?? const <String, dynamic>{};
    Widget section(String title, Object? value, {bool expanded = false}) {
      final lines = value is List
          ? value.whereType<String>().join('\n')
          : value is String
          ? value
          : '';
      if (lines.isEmpty) return const SizedBox.shrink();
      return ExpansionTile(
        title: Text(title),
        initiallyExpanded: expanded,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: SelectableText(lines),
          ),
        ],
      );
    }

    Widget proposals(String title, Object? value, String field) {
      final rows = value is List
          ? value.whereType<Map<Object?, Object?>>().toList()
          : const <Map<Object?, Object?>>[];
      if (rows.isEmpty) return const SizedBox.shrink();
      return ExpansionTile(
        title: Text(title),
        children: rows
            .map(
              (item) => ListTile(
                title: Text(
                  item[field] is String ? item[field]! as String : '',
                ),
                subtitle: Text(
                  [
                    item['owner'],
                    item['dueDate'],
                    if (item['evidence'] is String)
                      '${l10n.notesVoiceEvidence}: ${item['evidence']}',
                  ].whereType<String>().join('\n'),
                ),
              ),
            )
            .toList(),
      );
    }

    return AppDialogScaffold(
      title: l10n.notesVoiceReview,
      scrollHeader: true,
      description: l10n.notesVoiceProposalNotice,
      actions: [
        FilledButton.icon(
          onPressed: saving || !job.canSave ? null : onSave,
          icon: const Icon(Icons.save_outlined),
          label: Text(l10n.notesVoiceSave),
        ),
      ],
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!(job.transcript?.trim().isNotEmpty ?? false))
              Text(l10n.notesVoiceNoSpeech),
            section(
              l10n.notesVoiceSummary,
              artifact['summary'],
              expanded: true,
            ),
            section(l10n.notesVoiceDecisions, artifact['decisions']),
            proposals(l10n.notesVoiceActions, artifact['actionItems'], 'task'),
            proposals(
              l10n.notesVoiceRecommendations,
              artifact['recommendations'],
              'suggestion',
            ),
            section(l10n.notesVoiceQuestions, artifact['openQuestions']),
            section(l10n.notesVoiceTranscript, job.transcript),
          ],
        ),
      ),
    );
  }
}
