import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_scroll_to_bottom_overlay.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  for (final safeArea in [0.0, 34.0]) {
    for (final keyboard in [false, true]) {
      for (final scale in [1.0, 3.0]) {
        for (final navigationExpanded in [false, true]) {
          testWidgets(
            'FAB clears real composer: inset$safeArea keyboard$keyboard '
            'scale$scale navigation$navigationExpanded',
            (tester) async {
              tester.view.physicalSize = const Size(390, 900);
              tester.view.devicePixelRatio = 1;
              addTearDown(tester.view.resetPhysicalSize);
              addTearDown(tester.view.resetDevicePixelRatio);
              final controller = TextEditingController();
              final focus = FocusNode();
              addTearDown(controller.dispose);
              addTearDown(focus.dispose);
              await tester.pumpWidget(
                MaterialApp(
                  localizationsDelegates:
                      AppLocalizations.localizationsDelegates,
                  supportedLocales: AppLocalizations.supportedLocales,
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      padding: EdgeInsets.only(bottom: safeArea),
                      viewInsets: EdgeInsets.only(bottom: keyboard ? 300 : 0),
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: child!,
                  ),
                  home: shad.Theme(
                    data: const shad.ThemeData(
                      colorScheme: shad.ColorSchemes.lightZinc,
                    ),
                    child: Scaffold(
                      resizeToAvoidBottomInset: false,
                      body: Builder(
                        builder: (context) => Stack(
                          children: [
                            Positioned(
                              left: 16,
                              right: 16,
                              bottom: assistantComposerBottomOffset(context),
                              child: AssistantComposerDock(
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
                                navigationExpanded: navigationExpanded,
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
                            AssistantScrollToBottomOverlay(
                              composerVisible: true,
                              isFullscreen: false,
                              navigationExpanded: navigationExpanded,
                              visible: true,
                              onPressed: () {},
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pump();
              final composer = tester.getRect(
                find.byType(AssistantComposerDock),
              );
              final toggle = tester.getRect(
                find.byKey(const ValueKey('assistant-navigation-toggle')),
              );
              expect(toggle.bottom, composer.bottom);
              final fab = tester.getRect(
                find.byType(AssistantScrollToBottomFab),
              );
              expect(fab.bottom, lessThanOrEqualTo(composer.top - 16));
              expect(900 - composer.bottom, (keyboard ? 0 : safeArea) + 8);
              final gap = composer.top - fab.bottom;
              expect(gap, 16 + (navigationExpanded && !keyboard ? 84 : 0));
              expect(tester.takeException(), isNull);
            },
          );
        }
      }
    }
  }
}
