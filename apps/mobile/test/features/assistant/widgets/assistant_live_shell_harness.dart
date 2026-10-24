import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/l10n/l10n.dart';

const liveControlIds = ['microphone', 'camera', 'keyboard', 'exit'];
const liveShellChat = AssistantChatState(
  workspaceId: 'fixture-workspace',
  fallbackChatId: 'fixture-chat',
  messages: [
    AssistantMessage(
      id: 'fixture-message',
      role: 'assistant',
      parts: [
        AssistantMessagePart(
          type: 'text',
          text: 'Your conversation stays here while we reconnect.',
        ),
      ],
    ),
  ],
);

AssistantLiveState liveShellState(
  AssistantLiveConnectionStatus status, {
  bool ended = false,
}) => AssistantLiveState(
  workspaceId: 'fixture-workspace',
  chatId: 'fixture-chat',
  status: status,
  hasEnded: ended,
  isMicrophoneActive: status == AssistantLiveConnectionStatus.connected,
);

class LiveShellFrame {
  const LiveShellFrame({
    required this.state,
    this.live = true,
    this.expanded = false,
  });
  final AssistantLiveState state;
  final bool live;
  final bool expanded;
}

class LiveShellTestController extends ValueNotifier<LiveShellFrame> {
  LiveShellTestController(LiveShellFrame value) : super(value);
  final slots = ShellDockSlotController();
  final scroll = ScrollController();
  final input = TextEditingController();
  final focus = FocusNode();
  int microphone = 0;
  int camera = 0;
  int keyboard = 0;
  int exit = 0;
  int retries = 0;
  void toggleNavigation() => value = LiveShellFrame(
    state: value.state,
    live: value.live,
    expanded: !value.expanded,
  );
  @override
  void dispose() {
    slots.dispose();
    scroll.dispose();
    input.dispose();
    focus.dispose();
    super.dispose();
  }
}

/// Exercises the production publisher, shell, slot and retained dock material.
class AssistantLiveShellHarness extends StatelessWidget {
  const AssistantLiveShellHarness({
    required this.controller,
    this.width = 390,
    this.height = 844,
    this.locale = 'en',
    this.scale = 1,
    this.safeBottom = 34,
    this.ime = 0,
    this.reducedMotion = false,
    this.brightness = Brightness.light,
    super.key,
  });
  final LiveShellTestController controller;
  final double width;
  final double height;
  final String locale;
  final double scale;
  final double safeBottom;
  final double ime;
  final bool reducedMotion;
  final Brightness brightness;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: brightness == Brightness.light ? AppTheme.light : AppTheme.dark,
    home: MediaQuery(
      data: MediaQueryData(
        size: Size(width, height),
        textScaler: TextScaler.linear(scale),
        disableAnimations: reducedMotion,
        viewInsets: EdgeInsets.only(bottom: ime),
        viewPadding: EdgeInsets.only(top: 44, bottom: safeBottom),
        padding: EdgeInsets.only(top: 44, bottom: ime > 0 ? 0 : safeBottom),
      ),
      child: Scaffold(
        body: BlocProvider(
          create: (_) => AssistantChromeCubit()..enterLiveMode(),
          child: ShellDockScope(
            controller: controller.slots,
            child: ValueListenableBuilder<LiveShellFrame>(
              valueListenable: controller,
              builder: (context, frame, _) {
                final ui = deriveAssistantLiveUiState(
                  shellState: const AssistantShellState(),
                  liveState: frame.state,
                  isEligible: true,
                  isVisibleLiveSession: true,
                  showBlockedReason: false,
                );
                final composer = AssistantComposerDock(
                  embedded: true,
                  chatState: liveShellChat,
                  liveState: frame.state,
                  liveUiState: ui,
                  shellState: const AssistantShellState(),
                  navigationExpanded: false,
                  bottomInset: 0,
                  isPersonalWorkspace: true,
                  onModelSelected: (_) async {},
                  onOpenCreditSourceSheet: () async {},
                  onThinkingModeChanged: (_) async {},
                  controller: controller.input,
                  focusNode: controller.focus,
                  onOpenAttachments: () async {},
                  onToggleNavigation: controller.toggleNavigation,
                  onCloseComposer: () {},
                  onMicrophoneTap: () async {},
                  onSend: () async {},
                  onRemoveAttachment: (_) async {},
                );
                return FloatingShellDock(
                  location: '/assistant',
                  bottomInset: 84,
                  scrollableHeader: true,
                  header: Padding(
                    padding: mobileSectionAppBarPadding,
                    child: SizedBox(
                      height: mobileSectionAppBarHeightFor(context),
                      child: const AssistantModeTitle(),
                    ),
                  ),
                  keyboardVisible: ime > 0,
                  composerVisible: true,
                  keepNavigationVisible: true,
                  navigation: const SizedBox(
                    height: 52,
                    child: Center(child: Text('Shell navigation')),
                  ),
                  child: Stack(
                    children: [
                      if (frame.live)
                        AssistantLiveModeView(
                          chatState: liveShellChat,
                          liveState: frame.state,
                          liveUiState: ui,
                          assistantName: 'Mira',
                          scrollController: controller.scroll,
                          onRetry: () async {
                            controller.retries++;
                          },
                          onToggleMicrophone: () async {},
                          onToggleCamera: () async {},
                          onDisconnect: () async {},
                          onOpenTextEntry: () async {},
                        ),
                      ShellDockPublisher(
                        slot: ShellDockSlot(
                          location: '/assistant',
                          composing: !frame.expanded,
                          content: frame.live
                              ? AssistantLiveCallControls(
                                  state: frame.state,
                                  onMicrophone: () async {
                                    controller.microphone++;
                                  },
                                  onCamera: () async {
                                    controller.camera++;
                                  },
                                  onText: () async {
                                    controller.keyboard++;
                                  },
                                  onDisconnect: () async {
                                    controller.exit++;
                                  },
                                )
                              : composer,
                          primary: frame.live
                              ? AssistantLivePrimaryAction(
                                  key: const ValueKey('assistant-dock-primary'),
                                  onNavigation: controller.toggleNavigation,
                                )
                              : AssistantComposerPrimaryAction(
                                  key: const ValueKey('assistant-dock-primary'),
                                  controller: controller.input,
                                  focusNode: controller.focus,
                                  onToggleNavigation:
                                      controller.toggleNavigation,
                                  onSend: () async {},
                                ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    ),
  );
}
