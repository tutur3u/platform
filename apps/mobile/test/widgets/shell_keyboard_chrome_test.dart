import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_keyboard_chrome.dart';
import 'package:mobile/features/shell/view/shell_search_field.dart';

import '../helpers/helpers.dart';

void main() {
  testWidgets('IME hides navigation and FAB until keyboard closes', (
    tester,
  ) async {
    await tester.pumpApp(
      const ShellKeyboardChrome(
        child: Row(children: [Text('Navigation'), Text('FAB')]),
      ),
    );
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pump();
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    expect(
      tester.widget<IgnorePointer>(find.byType(IgnorePointer).last).ignoring,
      isTrue,
    );
    await tester.pump(const Duration(seconds: 2));
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    tester.view.resetViewInsets();
    await tester.pump();
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );
  });

  testWidgets('hardware focus hides dock; empty custom submit restores it', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    var submitted = false;
    var closed = false;
    await tester.pumpApp(
      Column(
        children: [
          ShellSearchField(
            action: ShellActionSpec(
              id: 'search',
              icon: Icons.search,
              searchController: controller,
              onSearchSubmitted: (_) => submitted = true,
              onCloseSearch: () => closed = true,
            ),
          ),
          const ShellKeyboardChrome(child: Text('Dock')),
        ],
      ),
    );
    await tester.pump();
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    expect(closed, isTrue);
    expect(submitted, isFalse);
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );
    // Removing an active search must not leave a process-global hidden flag.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpApp(
      const ShellKeyboardChrome(child: Text('Another route')),
    );
    await tester.pump();
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );
    expect(tester.takeException(), isNull);
  });
}
