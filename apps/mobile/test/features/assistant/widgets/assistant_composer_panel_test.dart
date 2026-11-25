import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final (name, window, railWidth, dock, maxPanelWidth) in [
    ('compact dock', const Size(390, 844), 0.0, true, 390.0),
    ('compact without dock', const Size(390, 844), 0.0, false, 390.0),
    ('medium dock', const Size(768, 1024), 0.0, true, 768.0),
    ('medium without dock', const Size(768, 1024), 0.0, false, 768.0),
    ('phone landscape dock', const Size(844, 390), 0.0, true, 844.0),
    ('wide phone landscape dock', const Size(1024, 390), 0.0, true, 1024.0),
    ('landscape rail', const Size(1024, 768), 80.0, false, 792.0),
    ('desktop sidebar', const Size(1440, 900), 240.0, false, 792.0),
  ]) {
    for (final safeArea in [0.0, 34.0]) {
      for (final keyboard in [0.0, 300.0]) {
        testWidgets(
          '$name panel clears safe area $safeArea and IME $keyboard',
          (tester) async {
            tester.view
              ..physicalSize = window
              ..devicePixelRatio = 1
              ..viewInsets = FakeViewPadding(bottom: keyboard);
            addTearDown(tester.view.reset);
            const viewportKey = ValueKey('assistant-viewport');
            final showKeyboard = keyboard > 0;
            final withNavigationDock = railWidth == 0;
            final showDock = dock && !showKeyboard;
            final dockClearance =
                ShellDockMetrics.clearanceFor(safeArea) + safeArea;
            double? measuredHeight;
            await tester.pumpWidget(
              MaterialApp(
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                home: MediaQuery(
                  data: MediaQueryData(
                    size: window,
                    padding: EdgeInsets.only(
                      bottom: showKeyboard
                          ? 0
                          : showDock
                          ? dockClearance
                          : safeArea,
                    ),
                    viewPadding: EdgeInsets.only(bottom: safeArea),
                    // The shell body consumes the IME inset beside the rail.
                    viewInsets: EdgeInsets.only(
                      bottom: withNavigationDock ? keyboard : 0,
                    ),
                    textScaler: TextScaler.linear(showKeyboard ? 3 : 1),
                  ),
                  child: Material(
                    child: Padding(
                      padding: EdgeInsets.only(
                        left: railWidth,
                        bottom: keyboard,
                      ),
                      child: Stack(
                        key: viewportKey,
                        children: [
                          AssistantComposerPanel(
                            showSuggestions: !showKeyboard,
                            onPromptSelected: (_) {},
                            onHeightChanged: (height) =>
                                measuredHeight = height,
                            child: Builder(
                              builder: (context) => SizedBox(
                                height: assistantComposerHeight(context),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );

            final viewport = find.byKey(viewportKey);
            final context = tester.element(viewport);
            final viewportRect = tester.getRect(viewport);
            final panelRect = tester.getRect(
              find.byType(AssistantComposerSizeReporter),
            );
            final cardRect = tester.getRect(find.byType(AppCard));
            final offset = assistantPageComposerBottomOffset(context);
            if (withNavigationDock) {
              expect(
                offset,
                showKeyboard
                    ? 0
                    : showDock
                    ? dockClearance
                    : safeArea,
              );
            } else if (showKeyboard) {
              expect(offset, AppSpacing.xl);
            } else {
              expect(offset, safeArea + AppSpacing.xl);
            }
            expect(
              viewportRect.bottom - cardRect.bottom,
              closeTo(offset, 0.01),
            );
            expect(panelRect.center.dx, closeTo(viewportRect.center.dx, 0.01));
            expect(panelRect.width, closeTo(maxPanelWidth, 0.01));
            expect(cardRect.center.dx, closeTo(panelRect.center.dx, 0.01));
            if (window == const Size(768, 1024)) {
              expect(cardRect.left, 24);
              expect(cardRect.right, 744);
            }
            if (!showKeyboard) {
              final stripRect = tester.getRect(
                find.byKey(const ValueKey('assistant-starter-prompts')),
              );
              // The prompts sit inside the composer card, above the field.
              expect(stripRect.left, closeTo(cardRect.left, 0.01));
              expect(stripRect.right, closeTo(cardRect.right, 0.01));
              expect(stripRect.top, greaterThanOrEqualTo(cardRect.top));
              expect(stripRect.bottom, lessThan(cardRect.bottom));
            }
            expect(measuredHeight, closeTo(panelRect.height, 0.01));
            expect(
              assistantPageTranscriptBottomClearance(
                context,
                composerHeight: measuredHeight,
              ),
              closeTo(panelRect.height + offset + AppSpacing.md, 0.01),
            );
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
