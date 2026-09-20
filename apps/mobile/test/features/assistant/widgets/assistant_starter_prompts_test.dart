import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  const viewports = {
    'phone portrait': Size(393, 852),
    'phone landscape': Size(852, 393),
    'tablet portrait': Size(834, 1194),
    'tablet landscape': Size(1194, 834),
  };

  for (final viewport in viewports.entries) {
    for (final scale in [1.0, 2.0]) {
      for (final locale in ['en', 'vi']) {
        testWidgets('${viewport.key}, $locale, ${scale}x text', (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = viewport.value;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final previousHitTestPolicy =
              WidgetController.hitTestWarningShouldBeFatal;
          WidgetController.hitTestWarningShouldBeFatal = true;
          addTearDown(() {
            WidgetController.hitTestWarningShouldBeFatal =
                previousHitTestPolicy;
          });
          String? selected;
          await tester.pumpWidget(
            MaterialApp(
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: Scaffold(
                appBar: AppBar(toolbarHeight: 72),
                body: Stack(
                  children: [
                    Align(
                      alignment: Alignment.topCenter,
                      child: SizedBox(
                        width: math.min(viewport.value.width, 720),
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(24, 12, 24, 120),
                          child: AssistantStarterPrompts(
                            onPromptSelected: (value) => selected = value,
                          ),
                        ),
                      ),
                    ),
                    const Positioned(
                      bottom: 16,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: SizedBox(
                          key: ValueKey('floating-navigation'),
                          height: 72,
                          width: 200,
                          child: ColoredBox(color: Colors.black),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final context = tester.element(find.byType(AssistantStarterPrompts));
          final l10n = context.l10n;
          final labels = [
            l10n.assistantStarterFocus,
            l10n.assistantStarterPlan,
            l10n.assistantStarterBacklog,
            l10n.assistantStarterDraft,
          ];
          Finder card(String label) => find.ancestor(
            of: find.text(label),
            matching: find.byType(InkWell),
          );
          final first = tester.getRect(card(labels.first));
          final second = tester.getRect(card(labels[1]));
          final twoColumns = viewport.value.width >= 720 && scale == 1;
          if (twoColumns) {
            expect(second.top, first.top);
            expect(second.left, greaterThan(first.right));
          } else {
            expect(second.top, greaterThan(first.bottom));
            expect(second.left, first.left);
          }

          // At normal tablet dimensions all four cards fit above navigation
          // immediately, without requiring an initial scroll.
          final navigation = tester.getRect(
            find.byKey(const ValueKey('floating-navigation')),
          );
          if (viewport.key.startsWith('tablet') && scale == 1) {
            expect(
              tester.getRect(card(labels.last)).bottom,
              lessThan(navigation.top),
            );
          }
          for (final label in labels) {
            final text = tester.widget<Text>(find.text(label));
            expect(text.maxLines, isNull);
            expect(text.overflow, isNot(TextOverflow.ellipsis));
          }
          await tester.ensureVisible(find.text(labels.last));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(
            tester.getCenter(find.text(labels.last)).dy,
            lessThan(navigation.top),
          );
          await tester.tap(find.text(labels.last));
          expect(selected, labels.last);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
