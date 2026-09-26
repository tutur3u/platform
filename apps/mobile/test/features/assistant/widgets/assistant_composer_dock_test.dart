import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  testWidgets('restoring preserves a draft and disables both send actions', (
    tester,
  ) async {
    final controller = TextEditingController(text: 'My unsent draft');
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    var sends = 0;
    Future<void> mount(AssistantChatStatus status) => tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: shad.Theme(
          data: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          child: Scaffold(
            body: AssistantComposerDock(
              chatState: AssistantChatState(
                status: status,
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
              shellState: const AssistantShellState(
                creditSource: AssistantCreditSource.personal,
                selectedModel: AssistantGatewayModel(
                  value: 'test-model',
                  label: 'Test model',
                  provider: 'test',
                ),
              ),
              isFullscreen: false,
              bottomInset: 0,
              isPersonalWorkspace: true,
              onModelSelected: (_) async {},
              onOpenCreditSourceSheet: () async {},
              onThinkingModeChanged: (_) async {},
              controller: controller,
              focusNode: focus,
              onOpenAttachments: () async {},
              onToggleFullscreen: () async {},
              onMicrophoneTap: () async {},
              onSend: () async {
                sends++;
              },
              onRemoveAttachment: (_) async {},
            ),
          ),
        ),
      ),
    );
    await mount(AssistantChatStatus.restoring);
    await tester.pumpAndSettle();
    final surface = tester.widget<Container>(
      find.byKey(const ValueKey('assistant-composer-surface')),
    );
    final decoration = surface.decoration! as BoxDecoration;
    expect(decoration.borderRadius, BorderRadius.circular(24));
    expect((decoration.border! as Border).isUniform, isTrue);
    expect(surface.clipBehavior, Clip.antiAlias);
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    expect(
      tester.widget<TextField>(find.byType(TextField)).onSubmitted,
      isNull,
    );
    expect(sends, 0);
    expect(controller.text, 'My unsent draft');
    await mount(AssistantChatStatus.idle);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    expect(sends, 1);
    expect(tester.takeException(), isNull);
  });
}
