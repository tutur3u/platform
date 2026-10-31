import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';

import '../../../helpers/design_render_harness.dart';

const double _lineHeight = 16 * 1.25;

Future<TextEditingController> _pumpComposer(
  WidgetTester tester, {
  required double scale,
}) async {
  DesignRender.setSize(tester, const Size(390, 240));
  final controller = TextEditingController();
  final focus = FocusNode();
  addTearDown(controller.dispose);
  addTearDown(focus.dispose);
  await tester.pumpWidget(
    DesignRenderApp(
      settings: const AppearanceSettings(),
      brightness: Brightness.dark,
      child: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            disableAnimations: true,
          ),
          child: Stack(
            children: [
              Positioned(
                left: 16,
                right: 16,
                bottom: 24,
                child: PersistentShellDock(
                  composing: true,
                  primary: AssistantComposerPrimaryAction(
                    controller: controller,
                    focusNode: focus,
                    onToggleNavigation: () {},
                    onSend: () async {},
                  ),
                  content: AssistantComposerDock(
                    embedded: true,
                    chatState: const AssistantChatState(
                      fallbackChatId: 'draft',
                    ),
                    liveState: const AssistantLiveState(),
                    liveUiState: const AssistantLiveUiState(
                      kind: AssistantLiveUiKind.unavailable,
                      tone: AssistantLiveUiTone.neutral,
                      workspaceTier: 'FREE',
                      activeTier: 'FREE',
                      creditSource: AssistantCreditSource.personal,
                      isEligible: false,
                      isVisibleLiveSession: false,
                    ),
                    shellState: const AssistantShellState(),
                    navigationExpanded: false,
                    bottomInset: 0,
                    isPersonalWorkspace: true,
                    onModelSelected: (_) async {},
                    onOpenCreditSourceSheet: () async {},
                    onThinkingModeChanged: (_) async {},
                    controller: controller,
                    focusNode: focus,
                    onOpenAttachments: () async {},
                    onToggleNavigation: () {},
                    onCloseComposer: () {},
                    onMicrophoneTap: () async {},
                    onSend: () async {},
                    onRemoveAttachment: (_) async {},
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  return controller;
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final scale in [1.0, 2.0]) {
    testWidgets('single-line prompt shares the dock centre at ${scale}x text', (
      tester,
    ) async {
      final controller = await _pumpComposer(tester, scale: scale);
      for (final (name, text) in [('empty', ''), ('typed', 'Hi')]) {
        controller.text = text;
        await tester.pumpAndSettle();
        await DesignRender.capture(
          tester,
          'assistant-composer-$name-${scale}x',
        );
        final surface = tester.getRect(
          find.byKey(const ValueKey('persistent-shell-dock-material')),
        );
        final editable = tester.getRect(find.byType(EditableText));
        final plus = tester.getCenter(find.byIcon(LucideIcons.plus));
        final mic = tester.getCenter(find.byIcon(LucideIcons.mic));
        expect(editable.height, closeTo(_lineHeight * scale, 0.5));
        expect(editable.center.dy, closeTo(surface.center.dy, 0.5));
        expect(plus.dy, closeTo(surface.center.dy, 0.5));
        expect(mic.dy, closeTo(surface.center.dy, 0.5));
      }
    });
  }

  testWidgets('multi-line prompt grows upward with controls on the last line', (
    tester,
  ) async {
    final controller = await _pumpComposer(tester, scale: 1);
    controller.text = 'Hi';
    await tester.pumpAndSettle();
    final single = tester.getRect(
      find.byKey(const ValueKey('persistent-shell-dock-material')),
    );

    controller.text = 'One\nTwo\nThree';
    await tester.pumpAndSettle();
    await DesignRender.capture(tester, 'assistant-composer-multiline-1.0x');
    final surface = tester.getRect(
      find.byKey(const ValueKey('persistent-shell-dock-material')),
    );
    final editable = tester.getRect(find.byType(EditableText));
    final plus = tester.getCenter(find.byIcon(LucideIcons.plus));
    final lastLineCentre = editable.bottom - _lineHeight / 2;

    expect(editable.height, closeTo(_lineHeight * 3, 0.5));
    expect(surface.bottom, single.bottom);
    expect(surface.height, closeTo(single.height + _lineHeight * 2, 0.5));
    expect(plus.dy, closeTo(lastLineCentre, 0.5));
  });
}
