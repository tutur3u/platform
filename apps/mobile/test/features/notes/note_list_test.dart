import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notes/note_list.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  testWidgets('notes stay compact and the whole row opens the selected note', (
    tester,
  ) async {
    final notes = [
      for (var i = 0; i < 3; i++)
        NoteRecord(
          id: '$i',
          title: 'Note $i',
          content: const {
            'type': 'doc',
            'content': [
              {
                'type': 'paragraph',
                'content': [
                  {'type': 'text', 'text': 'Preview'},
                ],
              },
            ],
          },
          updatedAt: DateTime(2026, 9, 26),
          archived: false,
        ),
    ];
    NoteRecord? selected;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SizedBox(
            width: 360,
            height: 400,
            child: NoteList(
              notes: notes,
              workspaceId: 'ws-1',
              selectedId: null,
              onSelect: (note) => selected = note,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Note 0'), findsOneWidget);
    expect(find.text('Note 2'), findsOneWidget);
    final first = tester.getTopLeft(find.text('Note 0')).dy;
    final second = tester.getTopLeft(find.text('Note 1')).dy;
    expect(second - first, lessThan(90));
    await tester.tap(find.text('Note 1'));
    expect(selected?.id, '1');
  });

  testWidgets('notes group by date and short titles start at the left edge', (
    tester,
  ) async {
    final now = DateTime.now();
    final notes = [
      NoteRecord(
        id: 'today',
        title: 'Short',
        content: const {'type': 'doc', 'content': <Object>[]},
        updatedAt: now,
        archived: false,
      ),
      NoteRecord(
        id: 'yesterday',
        title: 'Longer note title',
        content: const {'type': 'doc', 'content': <Object>[]},
        updatedAt: now.subtract(const Duration(days: 1)),
        archived: false,
      ),
    ];
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SizedBox(
            width: 360,
            height: 400,
            child: NoteList(
              notes: notes,
              workspaceId: 'ws-1',
              selectedId: null,
              onSelect: (_) {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Yesterday'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Short')).dx,
      tester.getTopLeft(find.text('Longer note title')).dx,
    );
  });
}
