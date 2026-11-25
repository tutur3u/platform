import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../../helpers/pump_app.dart';

void main() {
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('tooltips follow the ${mode.name} tokens like web', (
      tester,
    ) async {
      late TooltipThemeData theme;
      late AppTokens tokens;
      await tester.pumpApp(
        Builder(
          builder: (context) {
            theme = TooltipTheme.of(context);
            tokens = AppTokens.of(context);
            return const SizedBox.shrink();
          },
        ),
        themeMode: mode,
      );

      final decoration = theme.decoration! as BoxDecoration;
      expect(decoration.color, tokens.colorScheme.background);
      expect(decoration.border, Border.all(color: tokens.colorScheme.border));
      expect(theme.textStyle?.color, tokens.colorScheme.foreground);
      expect(theme.textStyle?.fontSize, 12);
      expect(
        theme.padding,
        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      );
      expect(theme.preferBelow, isFalse);
      expect(theme.waitDuration, Duration.zero);
    });
  }

  testWidgets('keyboard focus opens the tooltip, as on web', (tester) async {
    final focus = FocusNode();
    addTearDown(focus.dispose);
    await tester.pumpApp(
      Center(
        child: AppTooltip(
          message: 'Archive',
          child: TextButton(
            focusNode: focus,
            onPressed: () {},
            child: const Text('A'),
          ),
        ),
      ),
    );
    FocusManager.instance.highlightStrategy =
        FocusHighlightStrategy.alwaysTraditional;
    addTearDown(
      () => FocusManager.instance.highlightStrategy =
          FocusHighlightStrategy.automatic,
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    focus.requestFocus();
    await tester.pumpAndSettle();
    expect(find.text('Archive'), findsOneWidget);

    focus.unfocus();
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Archive'), findsNothing);
  });

  testWidgets('tabbing to the next button keeps its tooltip open', (
    tester,
  ) async {
    final first = FocusNode();
    final second = FocusNode();
    addTearDown(first.dispose);
    addTearDown(second.dispose);
    FocusManager.instance.highlightStrategy =
        FocusHighlightStrategy.alwaysTraditional;
    addTearDown(
      () => FocusManager.instance.highlightStrategy =
          FocusHighlightStrategy.automatic,
    );
    await tester.pumpApp(
      Center(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppTooltip(
              message: 'Archive',
              child: TextButton(
                focusNode: first,
                onPressed: () {},
                child: const Text('A'),
              ),
            ),
            AppTooltip(
              message: 'Delete',
              child: TextButton(
                focusNode: second,
                onPressed: () {},
                child: const Text('D'),
              ),
            ),
          ],
        ),
      ),
    );
    first.requestFocus();
    await tester.pumpAndSettle();
    expect(find.text('Archive'), findsOneWidget);

    second.requestFocus();
    await tester.pumpAndSettle();
    expect(find.text('Delete'), findsOneWidget);
    expect(find.text('Archive'), findsNothing);
  });

  testWidgets('a long tooltip wraps at the web max width', (tester) async {
    final key = GlobalKey<TooltipState>();
    await tester.pumpApp(
      Center(
        child: AppTooltip(
          tooltipKey: key,
          message: 'word ' * 80,
          child: const Text('target'),
        ),
      ),
    );
    key.currentState!.ensureTooltipVisible();
    await tester.pumpAndSettle();
    final bubble = find.ancestor(
      of: find.text('word ' * 80),
      matching: find.byType(DecoratedBox),
    );
    expect(tester.getSize(bubble.first).width, lessThanOrEqualTo(384));
  });

  testWidgets('a caller key can show the tooltip on demand', (tester) async {
    final key = GlobalKey<TooltipState>();
    await tester.pumpApp(
      Center(
        child: AppTooltip(
          tooltipKey: key,
          message: 'Exact time',
          child: const Text('2h ago'),
        ),
      ),
    );
    key.currentState!.ensureTooltipVisible();
    await tester.pumpAndSettle();
    expect(find.text('Exact time'), findsOneWidget);
  });
}
