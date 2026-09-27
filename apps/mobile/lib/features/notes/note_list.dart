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

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final sorted = [...notes]
      ..sort((a, b) {
        final aDate = a.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = b.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDate.compareTo(aDate);
      });
    final groups = <int, List<NoteRecord>>{};
    for (final note in sorted) {
      final localDate = note.updatedAt?.toLocal();
      final day = localDate == null
          ? null
          : DateTime(localDate.year, localDate.month, localDate.day);
      final age = day == null ? 31 : today.difference(day).inDays;
      final group = age <= 0
          ? 0
          : age == 1
          ? 1
          : age < 7
          ? 2
          : age < 30
          ? 3
          : 4;
      groups.putIfAbsent(group, () => []).add(note);
    }
    final scheme = Theme.of(context).colorScheme;
    final labels = [
      context.l10n.notesToday,
      context.l10n.notesYesterday,
      context.l10n.notesPrevious7Days,
      context.l10n.notesPrevious30Days,
      context.l10n.notesOlder,
    ];
    return ListView(
      padding: const EdgeInsets.only(bottom: 112),
      children: [
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
            child: Text(
              labels[entry.key],
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: ColoredBox(
              color: scheme.surfaceContainer,
              child: Column(
                children: [
                  for (var index = 0; index < entry.value.length; index++) ...[
                    if (index > 0)
                      Divider(
                        height: 1,
                        indent: 14,
                        endIndent: 14,
                        color: scheme.outlineVariant,
                      ),
                    _NoteRow(
                      note: entry.value[index],
                      selected: entry.value[index].id == selectedId,
                      onTap: () => onSelect(entry.value[index]),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _NoteRow extends StatelessWidget {
  const _NoteRow({
    required this.note,
    required this.selected,
    required this.onTap,
  });

  final NoteRecord note;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final date = note.updatedAt;
    final dateLabel = date == null
        ? ''
        : MaterialLocalizations.of(context).formatShortDate(date.toLocal());
    return Material(
      color: selected ? scheme.surfaceContainerHigh : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: double.infinity,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (note.locked) ...[
                      Icon(
                        Icons.lock_outline_rounded,
                        size: 16,
                        color: scheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 6),
                    ],
                    Expanded(
                      child: Text(
                        note.title.isEmpty
                            ? context.l10n.notesUntitled
                            : note.title,
                        textAlign: TextAlign.start,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                if (note.preview.isNotEmpty || dateLabel.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    [
                      dateLabel,
                      if (note.locked)
                        context.l10n.notesLocked
                      else if (note.preview.isNotEmpty)
                        note.preview,
                    ].where((part) => part.isNotEmpty).join('  ·  '),
                    textAlign: TextAlign.start,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
