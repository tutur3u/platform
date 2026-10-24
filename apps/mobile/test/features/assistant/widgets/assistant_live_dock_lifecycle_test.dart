import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_control_item.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

import 'assistant_live_shell_harness.dart';

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  for (final width in [320.0, 390.0]) {
    for (final locale in ['en', 'vi']) {
      for (final ime in [0.0, 280.0]) {
        for (final reduced in [false, true]) {
          testWidgets('retains chat/Live bounds, centers and material '
              '$width $locale IME=$ime reduced=$reduced', (tester) async {
            tester.view
              ..physicalSize = Size(width, 844)
              ..devicePixelRatio = 1;
            addTearDown(() {
              tester.view.resetPhysicalSize();
              tester.view.resetDevicePixelRatio();
            });
            final controller = LiveShellTestController(
              LiveShellFrame(
                live: false,
                state: liveShellState(
                  AssistantLiveConnectionStatus.disconnected,
                ),
              ),
            );
            addTearDown(controller.dispose);
            await tester.pumpWidget(
              AssistantLiveShellHarness(
                controller: controller,
                width: width,
                locale: locale,
                scale: 2,
                ime: ime,
                reducedMotion: reduced,
                safeBottom: 34,
              ),
            );
            await _settle(tester);
            final surface = find.byKey(
              const ValueKey('persistent-shell-dock-material'),
            );
            final primary = find.byKey(
              const ValueKey('floating-dock-primary-slot'),
            );
            final materialElement = tester.element(surface);
            final dockState = tester.state(find.byType(PersistentShellDock));
            final bounds = tester.getRect(surface);
            final primaryBounds = tester.getRect(primary);
            expect(find.byType(ShellDockPublisher), findsOneWidget);
            expect(find.byType(TextField), findsOneWidget);
            Map<String, Offset>? centers;
            for (final status in [
              AssistantLiveConnectionStatus.disconnected,
              AssistantLiveConnectionStatus.preparing,
              AssistantLiveConnectionStatus.connecting,
              AssistantLiveConnectionStatus.connected,
              AssistantLiveConnectionStatus.reconnecting,
              AssistantLiveConnectionStatus.error,
              AssistantLiveConnectionStatus.disconnected,
            ]) {
              controller.value = LiveShellFrame(
                state: liveShellState(
                  status,
                  ended:
                      centers != null &&
                      status == AssistantLiveConnectionStatus.disconnected,
                ),
              );
              // The page publisher updates after layout. Check its first
              // listener frame and every intermediate transition frame.
              await tester.pump();
              await tester.pump();
              for (final milliseconds in [0, 16, 80, 180, 320]) {
                await tester.pump(Duration(milliseconds: milliseconds));
                expect(tester.getRect(surface), bounds);
                expect(tester.getRect(primary), primaryBounds);
                expect(tester.element(surface), same(materialElement));
                expect(
                  tester.state(find.byType(PersistentShellDock)),
                  same(dockState),
                );
                expect(find.byType(ShellDockSurface), findsOneWidget);
                expect(find.byType(AssistantLiveCallControls), findsOneWidget);
                expect(find.byType(ShellDockControlItem), findsNWidgets(4));
                expect(find.byType(TextField), findsNothing);
                final current = {
                  for (final id in liveControlIds)
                    id: tester.getCenter(
                      find.byKey(ValueKey('live-control-$id')),
                    ),
                };
                centers ??= current;
                expect(current, centers);
                expect(tester.takeException(), isNull);
              }
            }
            // Navigation expansion is deliberate and reversible in every
            // state. It never changes a selected destination as a toggle.
            await tester.tap(find.byIcon(LucideIcons.menu));
            await _settle(tester);
            expect(find.text('Shell navigation'), findsOneWidget);
            expect(find.byType(AssistantLiveCallControls), findsNothing);
            await tester.tap(find.byIcon(LucideIcons.menu));
            await _settle(tester);
            expect(find.byType(AssistantLiveCallControls), findsOneWidget);
            expect(tester.element(surface), same(materialElement));
            controller.value = LiveShellFrame(
              live: false,
              state: controller.value.state,
            );
            await _settle(tester);
            expect(find.byType(TextField), findsOneWidget);
            expect(tester.getRect(surface), bounds);
            expect(tester.getRect(primary), primaryBounds);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}
