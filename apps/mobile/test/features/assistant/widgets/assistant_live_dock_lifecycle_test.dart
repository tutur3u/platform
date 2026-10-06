import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_primary_action.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  for (final width in [320.0, 390.0]) {
    testWidgets('one shell material and navbar width through calls at $width', (
      tester,
    ) async {
      tester.view
        ..physicalSize = Size(width, 720)
        ..devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final controller = ShellDockSlotController();
      addTearDown(controller.dispose);
      final owner = Object();
      var calls = 0;
      var cancellations = 0;
      var navigation = 0;
      void publish(
        AssistantLiveConnectionStatus status, {
        bool expanded = false,
      }) {
        final state = AssistantLiveState(status: status);
        controller.publish(
          owner,
          ShellDockSlot(
            location: '/assistant',
            composing:
                status == AssistantLiveConnectionStatus.connected && !expanded,
            expandContent: false,
            primary: AssistantLivePrimaryAction(
              state: state,
              assistantName: 'Mira',
              onCall: () async {
                calls++;
              },
              onCancel: () async {
                cancellations++;
              },
              onNavigation: () {
                navigation++;
              },
            ),
            content: AssistantLiveCallControls(
              state: state,
              onMicrophone: () async {},
              onCamera: () async {},
              onText: () async {},
              onDisconnect: () async {},
            ),
          ),
        );
      }

      publish(AssistantLiveConnectionStatus.disconnected);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(width, 720),
              textScaler: const TextScaler.linear(2),
            ),
            child: ShellDockScope(
              controller: controller,
              child: const FloatingShellDock(
                location: '/assistant',
                bottomInset: 68,
                navigation: SizedBox(height: 52, child: Text('Navigation')),
                child: SizedBox.expand(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final material = find.byKey(
        const ValueKey('persistent-shell-dock-material'),
      );
      final element = tester.element(material);
      final state = tester.state(find.byType(PersistentShellDock));
      final originalWidth = tester.getSize(material).width;
      await tester.tap(find.byTooltip('Call Mira'));
      expect(calls, 1);
      for (final status in [
        AssistantLiveConnectionStatus.preparing,
        AssistantLiveConnectionStatus.connecting,
        AssistantLiveConnectionStatus.reconnecting,
      ]) {
        publish(status);
        await tester.pumpAndSettle();
        expect(find.text('Navigation'), findsOneWidget);
        expect(find.byIcon(Icons.videocam_off_rounded), findsNothing);
        await tester.tap(find.byTooltip('Cancel call'));
        expect(tester.getSize(material).width, originalWidth);
        expect(tester.element(material), same(element));
      }
      expect(cancellations, 3);
      publish(AssistantLiveConnectionStatus.connected);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.getSize(material).width, originalWidth);
      expect(tester.element(material), same(element));
      await tester.pumpAndSettle();
      expect(find.text('Navigation'), findsNothing);
      expect(
        find.descendant(
          of: find.byType(AssistantLiveCallControls),
          matching: find.byType(ShellDockActionButton),
        ),
        findsNWidgets(4),
      );
      for (final button in tester.widgetList<IconButton>(
        find.byType(IconButton),
      )) {
        expect(button.onPressed, isNotNull);
      }
      await tester.tap(find.byIcon(Icons.menu_rounded));
      expect(navigation, 1);
      publish(AssistantLiveConnectionStatus.connected, expanded: true);
      await tester.pumpAndSettle();
      expect(find.text('Navigation'), findsOneWidget);
      publish(AssistantLiveConnectionStatus.disconnected);
      await tester.pumpAndSettle();
      expect(tester.getSize(material).width, originalWidth);
      expect(tester.element(material), same(element));
      expect(tester.state(find.byType(PersistentShellDock)), same(state));
      expect(find.byType(BackdropFilter), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
