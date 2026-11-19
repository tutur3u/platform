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
import 'package:mobile/features/assistant/widgets/assistant_composer_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';

import '../../../helpers/design_render_harness.dart';

const double _lineHeight = 16 * 1.25;

Future<TextEditingController> _pumpComposer(
  WidgetTester tester, {
  required double scale,
  bool inPage = false,
  VoidCallback? onRecord,
  VoidCallback? onSend,
  ValueChanged<String>? onPromptSelected,
}) async {
  DesignRender.setSize(tester, Size(inPage ? 320 : 390, 240));
  final controller = TextEditingController();
  final focus = FocusNode();
  addTearDown(controller.dispose);
  addTearDown(focus.dispose);
  final primary = AssistantComposerPrimaryAction(
    inPage: inPage,
    controller: controller,
    focusNode: focus,
    onToggleNavigation: () {},
    onSend: () async => onSend?.call(),
    onMicrophoneTap: inPage ? () async => onRecord?.call() : null,
  );
  final composer = AssistantComposerDock(
    inPage: inPage,
    pagePrimaryAction: inPage ? primary : null,
    embedded: true,
    chatState: const AssistantChatState(fallbackChatId: 'draft'),
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
  );
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
              if (inPage)
                AssistantComposerPanel(
                  showSuggestions: true,
                  onPromptSelected: onPromptSelected ?? (_) {},
                  onHeightChanged: (_) {},
                  child: composer,
                )
              else
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 24,
                  child: PersistentShellDock(
                    composing: true,
                    primary: primary,
                    content: composer,
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

  for (final scale in [1.0, 2.0]) {
    testWidgets('Mira composer aligns accessible controls at ${scale}x', (
      tester,
    ) async {
      var recordings = 0;
      var sends = 0;
      final controller = await _pumpComposer(
        tester,
        scale: scale,
        inPage: true,
        onRecord: () => recordings++,
        onSend: () => sends++,
      );
      final mic = find.byTooltip('Record');
      final send = find.byTooltip('Send message');
      final attach = find.byTooltip('Add attachments');
      final tools = find.byTooltip('Composer tools');
      final editable = find.byType(EditableText);

      void expectAlignment(Finder action) {
        for (final button in [attach, tools, action]) {
          expect(
            tester.getCenter(button).dy,
            closeTo(tester.getCenter(editable).dy, 0.5),
          );
        }
      }

      expectAlignment(mic);
      for (final button in [attach, tools, mic]) {
        final hitTarget = find
            .descendant(of: button, matching: find.byType(AppTapTarget))
            .first;
        expect(
          tester.getSize(hitTarget).shortestSide,
          greaterThanOrEqualTo(44),
        );
      }
      await tester.tap(mic);
      expect(recordings, 1);
      expect(send, findsNothing);
      controller.text = 'Hi';
      await tester.pump();
      expect(mic, findsNothing);
      expectAlignment(send);
      await tester.tap(send);
      expect(sends, 1);
      controller.text = '   ';
      await tester.pump();
      expect(mic, findsOneWidget);
      expect(send, findsNothing);

      final single = tester.getRect(editable);
      controller.text = 'One\nTwo\nThree';
      await tester.pump();
      final multiline = tester.getRect(editable);
      expect(multiline.height, greaterThan(single.height));
      expect(multiline.bottom, closeTo(single.bottom, 0.5));
      expect(
        tester.getCenter(send).dy,
        closeTo(multiline.bottom - single.height / 2, 0.5),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('starter prompts scroll through both outer gutters', (
    tester,
  ) async {
    String? selectedPrompt;
    await _pumpComposer(
      tester,
      scale: 1,
      inPage: true,
      onPromptSelected: (prompt) => selectedPrompt = prompt,
    );
    final strip = find.byKey(const ValueKey('assistant-starter-prompts'));
    expect(tester.getRect(strip).left, 0);
    expect(tester.getRect(strip).right, 320);
    final first = find
        .descendant(of: strip, matching: find.byType(AppChip))
        .first;
    final last = find
        .descendant(of: strip, matching: find.byType(AppChip))
        .last;
    expect(tester.getRect(first).left, AppSpacing.lg);
    final edge = tester.getTopRight(strip) + const Offset(-4, 24);
    await tester.dragFrom(edge, const Offset(-120, 0));
    await tester.pumpAndSettle();
    expect(tester.getRect(first).left, lessThan(AppSpacing.lg));
    final scrollable = find.descendant(
      of: strip,
      matching: find.byType(Scrollable),
    );
    final position = tester.state<ScrollableState>(scrollable).position;
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(tester.getRect(last).right, closeTo(320 - AppSpacing.lg, 0.5));
    await tester.tap(last);
    expect(
      selectedPrompt,
      tester
          .widget<Text>(find.descendant(of: last, matching: find.byType(Text)))
          .data,
    );
  });

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
