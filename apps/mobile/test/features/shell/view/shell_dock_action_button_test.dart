import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';

void main() {
  for (final width in [320.0, 600.0, 1024.0]) {
    for (final loading in [false, true]) {
      testWidgets('one action name and bounded label at $width/$loading', (
        tester,
      ) async {
        const label = 'Search synthetic workspace with a long translated label';
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(3)),
                child: Scaffold(
                  body: Center(
                    child: ShellDockActionButton(
                      action: ShellActionSpec(
                        id: 'synthetic-search',
                        icon: Icons.search,
                        tooltip: label,
                        isLoading: loading,
                        onPressed: () {},
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(find.bySemanticsLabel(label), findsOneWidget);
        expect(
          tester.getSize(find.byType(FilledButton)).width,
          lessThanOrEqualTo(240),
        );
        final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
        expect(tooltip.excludeFromSemantics, isTrue);
        if (width >= 600) {
          final text = tester.widget<Text>(find.text(label));
          expect(text.maxLines, 1);
          expect(text.overflow, TextOverflow.ellipsis);
        }
        semantics.dispose();
      });
    }
  }

  testWidgets('shared brand retains its product accessibility name', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ShellBrandTitle(title: 'Workspaces')),
      ),
    );
    final image = tester.widget<Image>(find.byType(Image));
    expect(image.semanticLabel, 'Tuturuuu');
    expect(image.width, 28);
    expect(image.height, 28);
  });
}
