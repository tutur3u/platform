import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_reading_preferences.dart';
import 'package:mocktail/mocktail.dart';

import 'mail_deferred_harness.dart';
import 'mail_preview_harness.dart';

/// Archive and Delete from the keyboard on the conversation list hold the row
/// behind the same Undo window as a swipe.
void main() {
  final f = MailDeferredFixture()..register();

  Future<void> mountDesktop(WidgetTester tester) async {
    useMailKeyboardPlatform();
    setMailSurface(tester, const Size(1440, 900));
    await MailReadingPreferences.instance.setKeyboardEnabled(true);
    await f.mount(tester);
  }

  Future<void> focusFirstRow(WidgetTester tester) async {
    await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
    await tester.pump();
  }

  Future<void> pressTrash(WidgetTester tester) async {
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.digit3, character: '#');
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await tester.pumpAndSettle();
  }

  Future<void> pressArchive(WidgetTester tester) async {
    await tester.sendKeyEvent(LogicalKeyboardKey.keyE, character: 'e');
    await tester.pumpAndSettle();
  }

  Future<void> openFolder(WidgetTester tester, String name) async {
    await tester.tap(
      find.descendant(
        of: find.byKey(const ValueKey('mail-folder-sidebar')),
        matching: find.text(name),
      ),
    );
    await tester.pumpAndSettle();
  }

  void stubBulk() => when(
    () => f.repository.bulk(
      any(),
      any(),
      any(),
      any(),
      threads: any(named: 'threads'),
      folderId: any(named: 'folderId'),
    ),
  ).thenAnswer((_) async {});

  for (final (name, press, action, message) in [
    ('#', pressTrash, 'trash', 'Moved to Trash'),
    ('E', pressArchive, 'archive', 'Archived'),
  ]) {
    testWidgets('$name holds the row and Undo returns it unsent', (
      tester,
    ) async {
      stubBulk();
      await mountDesktop(tester);
      await focusFirstRow(tester);

      await press(tester);

      expect(find.text('First'), findsNothing);
      expect(find.text(message), findsOneWidget);
      verifyNever(
        () => f.repository.bulk(
          any(),
          any(),
          any(),
          any(),
          threads: any(named: 'threads'),
          folderId: any(named: 'folderId'),
        ),
      );

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      expect(find.text('First'), findsOneWidget);
      verifyNever(
        () => f.repository.bulk(
          any(),
          any(),
          any(),
          any(),
          threads: any(named: 'threads'),
          folderId: any(named: 'folderId'),
        ),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('$name reaches the server when the Undo window ends', (
      tester,
    ) async {
      stubBulk();
      await mountDesktop(tester);
      await focusFirstRow(tester);

      await press(tester);
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();

      verify(
        () => f.repository.bulk('ws', 'box', ['First'], action, threads: true),
      ).called(1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('# on a row already in Trash does nothing', (tester) async {
    stubBulk();
    await mountDesktop(tester);
    await openFolder(tester, 'Trash');
    await focusFirstRow(tester);

    await pressTrash(tester);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    expect(find.text('First'), findsOneWidget);
    expect(find.text('Undo'), findsNothing);
    verifyNever(
      () => f.repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        folderId: any(named: 'folderId'),
      ),
    );
  });

  testWidgets('E on a row already in Archive does nothing', (tester) async {
    stubBulk();
    await mountDesktop(tester);
    await openFolder(tester, 'Archive');
    await focusFirstRow(tester);

    await pressArchive(tester);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    expect(find.text('First'), findsOneWidget);
    expect(find.text('Undo'), findsNothing);
    verifyNever(
      () => f.repository.bulk(
        any(),
        any(),
        any(),
        any(),
        threads: any(named: 'threads'),
        folderId: any(named: 'folderId'),
      ),
    );
  });
}
