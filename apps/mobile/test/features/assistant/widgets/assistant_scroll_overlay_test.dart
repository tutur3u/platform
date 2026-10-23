import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_scroll_to_bottom_overlay.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  for (final safe in [0.0, 34.0]) {
    for (final keyboard in [false, true]) {
      testWidgets('hidden composer uses shell clearance $safe $keyboard', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        var taps = 0;
        Future<void> mount({required bool visible}) async {
          await tester.pumpWidget(
            MaterialApp(
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: shad.Theme(
                data: const shad.ThemeData(
                  colorScheme: shad.ColorSchemes.lightZinc,
                ),
                child: MediaQuery(
                  data: MediaQueryData(
                    size: const Size(390, 844),
                    // The shell publishes occupied dock clearance to its body.
                    padding: EdgeInsets.only(
                      bottom: 96 + (keyboard ? 0 : safe),
                    ),
                    viewPadding: EdgeInsets.only(bottom: safe),
                    viewInsets: EdgeInsets.only(bottom: keyboard ? 300 : 0),
                    disableAnimations: true,
                  ),
                  child: Scaffold(
                    body: Stack(
                      children: [
                        AssistantScrollToBottomOverlay(
                          composerVisible: false,
                          isFullscreen: false,
                          navigationExpanded: true,
                          visible: visible,
                          onPressed: () => taps++,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
        }

        await mount(visible: true);
        final button = find.byIcon(Icons.arrow_downward_rounded);
        final rect = tester.getRect(button);
        final dockTop = 844 - (keyboard ? 300 : safe) - 96;
        expect(rect.bottom, lessThanOrEqualTo(dockTop - 16));
        await tester.tap(button);
        expect(taps, 1);
        await mount(visible: false);
        expect(button.hitTestable(), findsNothing);
        final tree = tester.getSemantics(find.byType(Scaffold)).toStringDeep();
        expect(tree, isNot(contains('Scroll to bottom')));
        semantics.dispose();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
