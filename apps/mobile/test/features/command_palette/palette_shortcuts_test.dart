import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/command_palette/palette_view.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mocktail/mocktail.dart';

import 'palette_host_harness.dart';

class _MailRepository extends Mock implements MailRepository {}

void main() {
  for (final (platform, modifier) in [
    (TargetPlatform.linux, LogicalKeyboardKey.controlLeft),
    (TargetPlatform.macOS, LogicalKeyboardKey.metaLeft),
  ]) {
    testWidgets(
      'new-item chord stays out of Mail compose on ${platform.name}',
      (tester) async {
        final harness = await pumpPaletteApp(
          tester,
          platform: platform,
          size: const Size(1200, 800),
          home: (context) => Scaffold(
            body: TextButton(
              autofocus: true,
              onPressed: () => Navigator.of(context).push<void>(
                MailComposerRoute(
                  builder: (_) => MailComposer(
                    repository: _MailRepository(),
                    workspaceId: 'workspace',
                    mailboxId: 'mailbox',
                    fromAddress: 'sender@example.test',
                  ),
                ),
              ),
              child: const Text('Open compose'),
            ),
          ),
        );

        await tester.tap(find.text('Open compose'));
        await tester.pumpAndSettle();
        await paletteChord(tester, modifier, LogicalKeyboardKey.keyN);
        expect(find.byType(MailComposer), findsOneWidget);
        expect(harness.path, Routes.home);

        await tester.enterText(find.byType(TextField).at(3), 'Draft subject');
        await paletteChord(tester, modifier, LogicalKeyboardKey.keyN);
        expect(find.byType(MailComposer), findsOneWidget);
        expect(find.text('Draft subject'), findsOneWidget);
        expect(harness.path, Routes.home);

        Navigator.of(tester.element(find.byType(MailComposer))).pop();
        await tester.pumpAndSettle();
        await paletteChord(tester, modifier, LogicalKeyboardKey.keyN);
        expect(harness.path, Routes.taskAssigned);
      },
    );
  }

  testWidgets('Ctrl+K opens above routed content and arrows select a route', (
    tester,
  ) async {
    final harness = await pumpPaletteApp(
      tester,
      platform: TargetPlatform.linux,
      size: const Size(1200, 800),
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    expect(find.byType(CommandPaletteView), findsNothing);
    await paletteChord(
      tester,
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.keyK,
    );
    final palette = find.byType(CommandPaletteView);
    expect(palette, findsOneWidget);
    expect(tester.getSize(palette).width, lessThanOrEqualTo(640));
    expect(find.text('Search commands, tasks, and notes'), findsOneWidget);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(palette, findsNothing);
    expect(harness.path, '/apps');
    expect(find.text('Apps route'), findsOneWidget);
  });

  testWidgets('Cmd+K opens a compact sheet, toggles it, and respects Escape', (
    tester,
  ) async {
    final harness = await pumpPaletteApp(
      tester,
      platform: TargetPlatform.macOS,
      size: const Size(390, 700),
    );
    Future<void> toggle() => paletteChord(
      tester,
      LogicalKeyboardKey.metaLeft,
      LogicalKeyboardKey.keyK,
    );

    await toggle();
    expect(find.byType(BottomSheet), findsOneWidget);
    await toggle();
    expect(find.byType(CommandPaletteView), findsNothing);

    await toggle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.byType(CommandPaletteView), findsNothing);
    expect(harness.path, '/');
  });

  for (final (platform, modifier, other) in [
    (
      TargetPlatform.linux,
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.metaLeft,
    ),
    (
      TargetPlatform.macOS,
      LogicalKeyboardKey.metaLeft,
      LogicalKeyboardKey.controlLeft,
    ),
  ]) {
    testWidgets(
      'tab and settings chords use one modifier on ${platform.name}',
      (tester) async {
        final harness = await pumpPaletteApp(
          tester,
          platform: platform,
          size: const Size(1200, 800),
        );

        await paletteChord(tester, other, LogicalKeyboardKey.digit2);
        expect(harness.path, Routes.home);
        await paletteChord(tester, modifier, LogicalKeyboardKey.digit2);
        expect(harness.path, Routes.apps);
        await paletteChord(tester, modifier, LogicalKeyboardKey.digit3);
        expect(harness.path, Routes.assistant);
        await paletteChord(tester, other, LogicalKeyboardKey.comma);
        expect(harness.path, Routes.assistant);
        await paletteChord(tester, modifier, LogicalKeyboardKey.comma);
        expect(harness.path, Routes.settings);
      },
    );
  }

  testWidgets(
    'a pushed full page keeps tab and settings chords from leaving it',
    (tester) async {
      final harness = await pumpPaletteApp(
        tester,
        platform: TargetPlatform.linux,
        size: const Size(1200, 800),
        home: (context) => Scaffold(
          body: TextButton(
            autofocus: true,
            onPressed: () => Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => const Scaffold(
                  body: TextField(autofocus: true, key: Key('draft')),
                ),
              ),
            ),
            child: const Text('Open editor'),
          ),
        ),
      );
      await tester.tap(find.text('Open editor'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('draft')), 'unsaved');

      for (final key in [
        LogicalKeyboardKey.digit1,
        LogicalKeyboardKey.digit2,
        LogicalKeyboardKey.digit5,
        LogicalKeyboardKey.comma,
        LogicalKeyboardKey.keyN,
      ]) {
        await paletteChord(tester, LogicalKeyboardKey.controlLeft, key);
        expect(harness.path, Routes.home, reason: key.keyLabel);
        expect(find.text('unsaved'), findsOneWidget, reason: key.keyLabel);
      }

      Navigator.of(tester.element(find.byKey(const Key('draft')))).pop();
      await tester.pumpAndSettle();
      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.digit2,
      );
      expect(harness.path, Routes.apps);
    },
  );
}
