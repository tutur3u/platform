import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/view/shell_sidebar_shortcuts.dart';

Future<List<SidebarBehavior>> _pump(
  WidgetTester tester, {
  required TargetPlatform platform,
  SidebarBehavior behavior = SidebarBehavior.expanded,
  bool field = false,
}) async {
  debugDefaultTargetPlatformOverride = platform;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);
  final selected = <SidebarBehavior>[];
  final node = FocusNode();
  addTearDown(node.dispose);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ShellSidebarShortcuts(
          focusNode: node,
          behavior: behavior,
          onSelected: selected.add,
          child: field
              ? const TextField(autofocus: true)
              : const SizedBox.expand(),
        ),
      ),
    ),
  );
  await tester.pump();
  return selected;
}

Future<void> _chord(
  WidgetTester tester,
  List<LogicalKeyboardKey> modifiers,
) async {
  for (final modifier in modifiers) {
    await tester.sendKeyDownEvent(modifier);
  }
  await tester.sendKeyEvent(LogicalKeyboardKey.keyB);
  for (final modifier in modifiers.reversed) {
    await tester.sendKeyUpEvent(modifier);
  }
  await tester.pump();
}

void main() {
  for (final (platform, own, foreign) in [
    (
      TargetPlatform.macOS,
      LogicalKeyboardKey.metaLeft,
      LogicalKeyboardKey.controlLeft,
    ),
    (
      TargetPlatform.linux,
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.metaLeft,
    ),
    (
      TargetPlatform.windows,
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.metaLeft,
    ),
  ]) {
    testWidgets('${platform.name} toggles on its own modifier only', (
      tester,
    ) async {
      final selected = await _pump(tester, platform: platform);

      await _chord(tester, [foreign]);
      expect(selected, isEmpty);
      await _chord(tester, [own]);
      expect(selected, [SidebarBehavior.collapsed]);
    });

    testWidgets('${platform.name} hides the sidebar with Alt', (tester) async {
      final selected = await _pump(tester, platform: platform);

      await _chord(tester, [foreign, LogicalKeyboardKey.altLeft]);
      expect(selected, isEmpty);
      await _chord(tester, [own, LogicalKeyboardKey.altLeft]);
      expect(selected, [SidebarBehavior.minimal]);
    });
  }

  testWidgets('a focused text field keeps the chord', (tester) async {
    final selected = await _pump(
      tester,
      platform: TargetPlatform.linux,
      field: true,
    );
    await tester.tap(find.byType(TextField));
    await tester.pump();
    expect(
      FocusManager.instance.primaryFocus?.context
          ?.findAncestorWidgetOfExactType<EditableText>(),
      isNotNull,
    );

    await _chord(tester, [LogicalKeyboardKey.controlLeft]);
    await _chord(tester, [
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.altLeft,
    ]);
    expect(selected, isEmpty);
  });

  testWidgets('a collapsed sidebar expands', (tester) async {
    final selected = await _pump(
      tester,
      platform: TargetPlatform.macOS,
      behavior: SidebarBehavior.collapsed,
    );

    await _chord(tester, [LogicalKeyboardKey.metaLeft]);
    expect(selected, [SidebarBehavior.expanded]);
  });
}
