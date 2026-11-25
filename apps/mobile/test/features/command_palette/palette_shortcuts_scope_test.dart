import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/command_palette/palette_shortcut_help.dart';
import 'package:mobile/features/command_palette/palette_view.dart';

import 'palette_host_harness.dart';

const _size = Size(1200, 800);

Widget _editorPage(BuildContext context) => const Scaffold(
  body: AppTextField(placeholder: 'Routed editor', autofocus: true),
);

void main() {
  group('a focused routed editor keeps its keys', () {
    for (final (platform, modifier) in [
      (TargetPlatform.linux, LogicalKeyboardKey.controlLeft),
      (TargetPlatform.windows, LogicalKeyboardKey.controlLeft),
      (TargetPlatform.macOS, LogicalKeyboardKey.metaLeft),
    ]) {
      testWidgets('on ${platform.name}', (tester) async {
        final harness = await pumpPaletteApp(
          tester,
          platform: platform,
          size: _size,
          home: _editorPage,
        );
        expect(
          FocusManager.instance.primaryFocus?.context
              ?.findAncestorWidgetOfExactType<EditableText>(),
          isNotNull,
        );

        for (final key in [
          LogicalKeyboardKey.keyK,
          LogicalKeyboardKey.digit2,
          LogicalKeyboardKey.comma,
          LogicalKeyboardKey.slash,
          LogicalKeyboardKey.keyN,
        ]) {
          await paletteChord(tester, modifier, key);
          expect(find.byType(CommandPaletteView), findsNothing);
          expect(find.byType(PaletteShortcutHelp), findsNothing);
          expect(harness.path, Routes.home, reason: key.keyLabel);
        }
      });
    }

    testWidgets('while the palette search field still toggles the palette', (
      tester,
    ) async {
      await pumpPaletteApp(tester, platform: TargetPlatform.linux, size: _size);
      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.keyK,
      );
      expect(find.byType(CommandPaletteView), findsOneWidget);
      expect(
        FocusManager.instance.primaryFocus?.context
            ?.findAncestorWidgetOfExactType<EditableText>(),
        isNotNull,
      );

      await paletteChord(
        tester,
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.keyK,
      );
      expect(find.byType(CommandPaletteView), findsNothing);
    });
  });

  group('a hardware keyboard on a mobile platform leaves routing alone', () {
    for (final platform in [
      TargetPlatform.android,
      TargetPlatform.iOS,
      TargetPlatform.fuchsia,
    ]) {
      testWidgets('on ${platform.name}', (tester) async {
        final harness = await pumpPaletteApp(
          tester,
          platform: platform,
          size: _size,
        );

        for (final modifier in [
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.metaLeft,
        ]) {
          for (final key in [
            LogicalKeyboardKey.keyK,
            LogicalKeyboardKey.digit2,
            LogicalKeyboardKey.comma,
            LogicalKeyboardKey.slash,
            LogicalKeyboardKey.keyN,
          ]) {
            await paletteChord(tester, modifier, key);
            expect(find.byType(CommandPaletteView), findsNothing);
            expect(find.byType(PaletteShortcutHelp), findsNothing);
            expect(harness.path, Routes.home, reason: key.keyLabel);
          }
        }
      });
    }
  });
}
