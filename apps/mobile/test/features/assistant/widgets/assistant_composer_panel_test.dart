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
    ('medium dock', const Size(768, 1024), 0.0, true, 640.0),
    ('medium without dock', const Size(768, 1024), 0.0, false, 640.0),
    ('landscape rail', const Size(1024, 768), 80.0, false, 680.0),
    ('desktop sidebar', const Size(1440, 900), 240.0, false, 680.0),
  ]) {
    for (final safeArea in [0.0, 34.0]) {
      for (final keyboard in [0.0, 300.0]) {
        testWidgets('$name panel clears safe area $safeArea and IME $keyboard', (
          tester,
        ) async {
          tester.view
            ..physicalSize = window
            ..devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          const viewportKey = ValueKey('assistant-viewport');
          final showKeyboard = keyboard > 0;
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
                  viewInsets: EdgeInsets.only(bottom: keyboard),
                  textScaler: TextScaler.linear(showKeyboard ? 3 : 1),
                ),
                child: Material(
                  child: Padding(
                    padding: EdgeInsets.only(left: railWidth, bottom: keyboard),
                    child: Stack(
                      key: viewportKey,
                      children: [
                        AssistantComposerPanel(
                          showSuggestions: !showKeyboard,
                          onPromptSelected: (_) {},
                          onHeightChanged: (height) => measuredHeight = height,
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
          final minGap = window.width == 390 ? AppSpacing.md : AppSpacing.xl;
          final safeBottom = showKeyboard ? 0.0 : safeArea;
          expect(offset, showDock ? dockClearance : safeBottom + minGap);
          expect(offset - safeBottom, greaterThanOrEqualTo(minGap));
          expect(viewportRect.bottom - cardRect.bottom, closeTo(offset, 0.01));
          expect(panelRect.center.dx, closeTo(viewportRect.center.dx, 0.01));
          expect(panelRect.width, closeTo(maxPanelWidth, 0.01));
          expect(cardRect.center.dx, closeTo(panelRect.center.dx, 0.01));
          if (!showKeyboard) {
            final stripRect = tester.getRect(
              find.byKey(const ValueKey('assistant-starter-prompts')),
            );
            expect(stripRect.center.dx, closeTo(panelRect.center.dx, 0.01));
            expect(stripRect.width, closeTo(panelRect.width, 0.01));
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
        });
      }
    }
  }
}
