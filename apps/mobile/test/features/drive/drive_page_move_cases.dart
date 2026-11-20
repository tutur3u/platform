part of 'drive_page_test.dart';

void _registerDriveMoveTests({
  required Future<void> Function(WidgetTester) mount,
  required _Drive Function() repository,
  required ShellChromeActionsCubit Function() actions,
  required void Function(AuthState) onAuth,
}) {
  const movingActor = User(
    id: 'moving-actor',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '',
  );

  Future<void> openMovePicker(
    WidgetTester tester, {
    bool secondPage = false,
  }) async {
    repository().load = (ws, offset, query) async => offset == 0
        ? DriveListResult.fromJson({
            'data': [
              const {'name': 'Reports'},
              const {'name': 'Plans'},
              if (!secondPage) const {'name': 'Archive'},
            ],
            'pagination': {
              'total': secondPage ? 2 : 3,
              'offset': 0,
              'limit': 100,
              'hasMore': secondPage,
            },
          })
        : result(['Archive'], offset: offset);
    await mount(tester);
    onAuth(const AuthState.authenticated(movingActor));
    await pump(tester);
    await tester.longPress(find.text('Reports'));
    await tester.tap(find.text('Plans'));
    await pump(tester);
    actions().state
        .resolveForLocation(Routes.drive)
        .singleWhere((action) => action.id == 'drive-move-selected')
        .onPressed!();
    await pump(tester);
  }

  testWidgets('moves selected folders to a valid destination', (tester) async {
    await openMovePicker(tester);
    final picker = find.byType(AppSheetScaffold);
    final moveHere = find.descendant(
      of: picker,
      matching: find.text('Move here'),
    );
    expect(
      find.descendant(of: picker, matching: find.text('Reports')),
      findsNothing,
    );
    expect(
      find.descendant(of: picker, matching: find.text('Plans')),
      findsNothing,
    );
    expect(
      tester
          .widget<AppButton>(
            find.ancestor(of: moveHere, matching: find.byType(AppButton)),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(
      find.descendant(of: picker, matching: find.text('Archive')),
    );
    await pump(tester);
    await tester.tap(moveHere);
    await pump(tester);
    final move = repository().moves.single;
    expect(move.source, '');
    expect(move.destination, 'Archive');
    expect(move.entries, ['Reports', 'Plans']);
  });

  testWidgets('moves selected folders to a destination on page two', (
    tester,
  ) async {
    await openMovePicker(tester, secondPage: true);
    final picker = find.byType(AppSheetScaffold);
    Finder inPicker(String text) =>
        find.descendant(of: picker, matching: find.text(text));
    expect(inPicker('Archive'), findsNothing);
    await tester.tap(inPicker('Load more'));
    await pump(tester);
    expect(repository().requests.last.offset, 100);
    await tester.tap(inPicker('Archive'));
    await pump(tester);
    await tester.tap(inPicker('Move here'));
    await pump(tester);
    expect(repository().moves.single.destination, 'Archive');
  });

  testWidgets('reports visible files and preserves the reason a move stopped', (
    tester,
  ) async {
    repository().moveResults = const [
      DriveMoveResult(
        name: 'Reports',
        status: DriveMoveStatus.uncertain,
        totalFiles: 5,
        movedFiles: 2,
        movedMarkers: 1,
      ),
      DriveMoveResult(
        name: 'Plans',
        status: DriveMoveStatus.skipped,
        totalFiles: 0,
        movedFiles: 0,
        movedMarkers: 0,
      ),
    ];
    await openMovePicker(tester);
    final picker = find.byType(AppSheetScaffold);
    await tester.tap(
      find.descendant(of: picker, matching: find.text('Archive')),
    );
    await pump(tester);
    await tester.tap(find.text('Move here'));
    await pump(tester);
    expect(
      find.text(
        '2 of 5 files moved. The move result is unknown. '
        'Check both folders before trying again.',
      ),
      findsOneWidget,
    );
    expect(find.text('Skipped after the move stopped.'), findsOneWidget);
  });

  testWidgets('closes the move picker when the account changes', (
    tester,
  ) async {
    await openMovePicker(tester);
    expect(find.text('Move here'), findsOneWidget);
    onAuth(const AuthState.unauthenticated());
    await pump(tester);
    expect(find.text('Move here'), findsNothing);
    expect(repository().moves, isEmpty);
  });
}
