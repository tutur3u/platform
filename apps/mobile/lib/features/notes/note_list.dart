import 'package:flutter/material.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/l10n/l10n.dart';

class NoteList extends StatelessWidget {
  const NoteList({
    required this.notes,
    required this.selectedId,
    required this.onSelect,
    super.key,
  });

  final List<NoteRecord> notes;
  final String? selectedId;
  final ValueChanged<NoteRecord> onSelect;

  @override
  Widget build(BuildContext context) {
    if (notes.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
            child: Text(context.l10n.notesEmpty, textAlign: TextAlign.center),
          ),
        ],
      );
    }

    final scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 112),
      itemCount: notes.length,
      itemBuilder: (context, index) {
        final note = notes[index];
        final selected = note.id == selectedId;
        final preview = note.preview;
        final date = note.updatedAt;
        final dateLabel = date == null
            ? ''
            : MaterialLocalizations.of(context).formatShortDate(date.toLocal());
        return DecoratedBox(
          decoration: BoxDecoration(
            color: selected
                ? scheme.surfaceContainerHigh
                : scheme.surfaceContainer,
            borderRadius: BorderRadius.vertical(
              top: index == 0 ? const Radius.circular(14) : Radius.zero,
              bottom: index == notes.length - 1
                  ? const Radius.circular(14)
                  : Radius.zero,
            ),
          ),
          child: Column(
            children: [
              InkWell(
                onTap: () => onSelect(note),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        note.title.isEmpty
                            ? context.l10n.notesUntitled
                            : note.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (preview.isNotEmpty || dateLabel.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          [
                            dateLabel,
                            if (preview.isNotEmpty) preview,
                          ].where((part) => part.isNotEmpty).join('  ·  '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              if (index < notes.length - 1)
                Divider(
                  height: 1,
                  indent: 14,
                  endIndent: 14,
                  color: scheme.outlineVariant,
                ),
            ],
          ),
        );
      },
    );
  }
}
