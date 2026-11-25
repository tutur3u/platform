import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_action_bar.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_reading_preferences.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

void main() {
  Future<MailPreviewRepository> mount(
    WidgetTester tester,
    Size size, {
    double leadingInset = 0,
    int threads = 3,
  }) async {
    setMailSurface(tester, size);
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: threads, latency: Duration.zero);
    await tester.pumpApp(
      Padding(
        padding: EdgeInsets.only(left: leadingInset),
        child: MailWorkspace(workspaceId: 'ws', repository: repository),
      ),
    );
    await tester.pumpAndSettle();
    return repository;
  }

  testWidgets('desktop mail aligns folders, list and selected reader', (
    tester,
  ) async {
    await mount(tester, const Size(1600, 900), leadingInset: 240);
    final sidebar = tester.getRect(
      find.byKey(const ValueKey('mail-folder-sidebar')),
    );
    final list = tester.getRect(
      find.byKey(const ValueKey('mail-conversations')),
    );
    final emptyReader = tester.getRect(find.text('Select a conversation'));
    expect(sidebar.width, greaterThanOrEqualTo(160));
    expect(sidebar.right, lessThan(list.left));
    // The list takes web Mail's default 38% of the master-detail body.
    expect(list.width, inInclusiveRange(420, 460));
    expect(list.right, lessThan(emptyReader.left));

    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pumpAndSettle();
    expect(readerText('Full body 1'), findsOneWidget);
    final selected = find.byWidgetPredicate(
      (widget) =>
          widget is MailMessageTile &&
          widget.active &&
          widget.item['id'] == 'thread-1',
    );
    expect(selected, findsOneWidget);
    expect(
      tester.getRect(find.byType(MailReader)).left,
      greaterThan(list.right),
    );
    expect(tester.takeException(), isNull);
    await drain(tester);
  });

  for (final (size, choice, advances) in [
    (const Size(390, 844), MailAfterArchive.next, true),
    (const Size(1440, 900), MailAfterArchive.next, true),
    (const Size(1440, 900), MailAfterArchive.list, false),
  ]) {
    testWidgets('archive at width ${size.width} follows ${choice.name}', (
      tester,
    ) async {
      final preferences = MailReadingPreferences.instance;
      await mount(tester, size, leadingInset: size.width > 1000 ? 240 : 0);
      await preferences.setAfterArchive(choice);
      await tester.tap(find.text('Synthetic subject 0'));
      await tester.pumpAndSettle();
      final archive = find.descendant(
        of: find.byType(MailReader),
        matching: find.byTooltip('Archive'),
      );
      expect(archive, findsOneWidget);
      await tester.tap(archive);
      await tester.pumpAndSettle();
      expect(
        readerText('Full body 1'),
        advances ? findsOneWidget : findsNothing,
      );
      expect(find.text('Undo'), findsOneWidget);
      if (size.width > 1000) {
        final undo = tester.getRect(find.text('Undo'));
        final compose = tester.getRect(find.text('Compose'));
        expect(undo.overlaps(compose), isFalse);
      }
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('Undo'), findsNothing);
      expect(tester.takeException(), isNull);
      await drain(tester);
    });
  }

  testWidgets('Mail shortcuts honor the toggle and a focused search input', (
    tester,
  ) async {
    useMailKeyboardPlatform();
    await mount(tester, const Size(1440, 900), leadingInset: 240);
    final preferences = MailReadingPreferences.instance;
    await preferences.setKeyboardEnabled(false);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
    await tester.pump();
    expect(
      find.byWidgetPredicate(
        (widget) => widget is MailMessageTile && widget.keyboardActive,
      ),
      findsNothing,
    );
    await preferences.setKeyboardEnabled(true);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(readerText('Full body 0'), findsOneWidget);

    await tester.sendKeyEvent(LogicalKeyboardKey.slash);
    await tester.pumpAndSettle();
    final search = tester.widget<EditableText>(
      find.descendant(
        of: find.byWidgetPredicate(
          (widget) =>
              widget is TextField &&
              widget.decoration?.hintText == 'Search mail',
        ),
        matching: find.byType(EditableText),
      ),
    );
    expect(search.focusNode.hasFocus, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
    await tester.pumpAndSettle();
    expect(readerText('Full body 0'), findsOneWidget);
    expect(find.byType(MailActionBar), findsOneWidget);
    expect(tester.takeException(), isNull);
    await drain(tester);
  });

  for (final platform in [
    TargetPlatform.android,
    TargetPlatform.iOS,
    TargetPlatform.fuchsia,
  ]) {
    testWidgets(
      'a hardware keyboard on a wide ${platform.name} viewport leaves Mail '
      'commands unbound',
      (tester) async {
        useMailKeyboardPlatform(platform);
        await mount(tester, const Size(1440, 900), leadingInset: 240);
        await MailReadingPreferences.instance.setKeyboardEnabled(true);

        await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
        await tester.sendKeyEvent(LogicalKeyboardKey.enter);
        await tester.pumpAndSettle();

        expect(
          find.byWidgetPredicate(
            (widget) => widget is MailMessageTile && widget.keyboardActive,
          ),
          findsNothing,
        );
        expect(readerText('Full body 0'), findsNothing);
        expect(tester.takeException(), isNull);
        await drain(tester);
      },
    );
  }
}
