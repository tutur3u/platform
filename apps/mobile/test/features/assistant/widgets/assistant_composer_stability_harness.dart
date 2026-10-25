import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_starter_prompts.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';

import '../../../helpers/helpers.dart';

Future<void> pumpStableComposer(
  WidgetTester tester, {
  required TextEditingController controller,
  required FocusNode focus,
  double width = 390,
  double keyboard = 0,
  double safeArea = 34,
  double textScale = 1,
  Brightness brightness = Brightness.light,
}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpThemedHome(
    MediaQuery(
      data: MediaQueryData(
        size: Size(width, 844),
        padding: EdgeInsets.only(bottom: keyboard > 0 ? 0 : safeArea),
        viewPadding: EdgeInsets.only(bottom: safeArea),
        viewInsets: EdgeInsets.only(bottom: keyboard),
        textScaler: TextScaler.linear(textScale),
        disableAnimations: true,
      ),
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        body: Builder(
          builder: (context) => Stack(
            children: [
              Positioned.fill(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 60, 16, 220),
                  children: [
                    AssistantStarterPrompts(
                      onPromptSelected: (prompt) => controller.text = prompt,
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: assistantComposerBottomOffset(context),
                child: PersistentShellDock(
                  composing: true,
                  content: AssistantComposerDock(
                    embedded: true,
                    chatState: const AssistantChatState(
                      fallbackChatId: 'stability-draft',
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
                  primary: AssistantComposerPrimaryAction(
                    controller: controller,
                    focusNode: focus,
                    onToggleNavigation: () {},
                    onSend: () async {},
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
    brightness: brightness,
  );
  await tester.pumpAndSettle();
}
