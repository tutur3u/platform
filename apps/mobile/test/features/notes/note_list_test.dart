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
}
