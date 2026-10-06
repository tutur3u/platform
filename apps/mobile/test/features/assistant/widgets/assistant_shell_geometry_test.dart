import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_scroll_to_bottom_overlay.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

void main() {
  for (final composing in [false, true]) {
    for (final keyboard in [0.0, 300.0]) {
      for (final scale in [1.0, 3.0]) {
        testWidgets(
          'actual shell clearance composer$composing IME$keyboard scale$scale',
          (tester) async {
            tester.view.physicalSize = const Size(390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final portal = ShellDockSlotController();
            addTearDown(portal.dispose);
            double? viewportInset;
            await tester.pumpApp(
              Builder(
                builder: (context) {
                  return MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      padding: EdgeInsets.only(bottom: keyboard == 0 ? 34 : 0),
                      viewPadding: const EdgeInsets.only(bottom: 34),
                      viewInsets: EdgeInsets.only(bottom: keyboard),
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: shad.Scaffold(
                      child: ShellDockScope(
                        controller: portal,
                        child: FloatingShellDock(
                          location: Routes.assistant,
                          bottomInset: 76,
                          reserveNavigationClearance: !composing,
                          keepNavigationVisible: true,
                          composerVisible: composing,
                          navigation: const SizedBox(height: 52),
                          child: Builder(
                            builder: (bodyContext) {
                              viewportInset = MediaQuery.viewInsetsOf(
                                bodyContext,
                              ).bottom;
                              return shad.Scaffold(
                                resizeToAvoidBottomInset: false,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    ShellDockPublisher(
                                      slot: ShellDockSlot(
                                        location: Routes.assistant,
                                        composing: composing,
                                        content: SizedBox(
                                          height: assistantComposerHeight(
                                            bodyContext,
                                          ),
                                        ),
                                        primary: const SizedBox(
                                          width: 48,
                                          height: 48,
                                        ),
                                      ),
                                    ),
                                    AssistantScrollToBottomOverlay(
                                      composerVisible: composing,
                                      isFullscreen: false,
                                      navigationExpanded: false,
                                      visible: true,
                                      onPressed: () {},
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
            await tester.pumpAndSettle();
            expect(
              viewportInset,
              0,
              reason: 'outer shell consumes IME exactly once',
            );
            final dock = tester.getRect(
              find.byKey(const ValueKey('persistent-shell-dock-material')),
            );
            final fab = tester.getRect(find.byType(AssistantScrollToBottomFab));
            expect(
              dock.bottom,
              closeTo(900 - keyboard - (keyboard == 0 ? 34 : 0) - 8, 0.1),
            );
            expect(fab.bottom, lessThanOrEqualTo(dock.top - 16));
            if (composing) expect(dock.top - fab.bottom, closeTo(16, 0.1));
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }
}
