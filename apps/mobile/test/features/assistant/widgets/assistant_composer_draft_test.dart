import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_prompt_editor.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

final GlobalKey _rasterKey = GlobalKey();
Future<void> _pump(
  WidgetTester tester,
  TextEditingController controller,
  FocusNode focus, {
  ValueNotifier<AssistantChatState>? chat,
  double scale = 1,
  bool dark = false,
  bool reduced = true,
  Future<void> Function()? onSend,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(
        fontFamily: 'NotoSans',
        brightness: dark ? Brightness.dark : Brightness.light,
      ),
      builder: (context, child) => shad.Theme(
        data: dark
            ? const shad.ThemeData.dark(colorScheme: shad.ColorSchemes.darkZinc)
            : const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        child: MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            disableAnimations: reduced,
            padding: const EdgeInsets.only(top: 47, bottom: 34),
          ),
          child: child!,
        ),
      ),
      home: Scaffold(
        body: RepaintBoundary(
          key: _rasterKey,
          child: Stack(
            children: [
              Positioned(
                left: 12,
                right: 12,
                bottom: 42,
                child: Builder(
                  builder: (_) {
                    Widget dock(AssistantChatState state) {
                      Future<void> remove(String id) async {
                        chat?.value = state.copyWith(
                          composerAttachments: state.composerAttachments
                              .where((a) => a.id != id)
                              .toList(),
                        );
                      }

                      return PersistentShellDock(
                        composing: true,
                        primary: AssistantComposerPrimaryAction(
                          controller: controller,
                          focusNode: focus,
                          onToggleNavigation: () {},
                          onSend: onSend ?? () async {},
                          hasAttachments: state.composerAttachments.isNotEmpty,
                          attachments: state.composerAttachments,
                          onRemoveAttachment: remove,
                          blocked:
                              state.status == AssistantChatStatus.restoring,
                        ),
                        content: _composer(controller, focus, state, remove),
                      );
                    }

                    return chat == null
                        ? dock(
                            const AssistantChatState(fallbackChatId: 'draft'),
                          )
                        : ValueListenableBuilder<AssistantChatState>(
                            valueListenable: chat,
                            builder: (_, state, _) => dock(state),
                          );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Widget _composer(
  TextEditingController controller,
  FocusNode focus,
  AssistantChatState state,
  Future<void> Function(String) onRemove,
) => AssistantComposerDock(
  embedded: true,

  chatState: state,
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
  onRemoveAttachment: onRemove,
);

void main() {
  setUpAll(() async {
    final loader = FontLoader('NotoSans')
      ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
    await loader.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  testWidgets('focused prompt keeps its height and exposes draft expansion', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = TextEditingController(text: 'Synthetic draft');
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    await _pump(tester, controller, focus);
    final initialHeight = tester.getRect(find.byType(TextField)).height;
    focus.requestFocus();
    await tester.pumpAndSettle();
    final path = Platform.environment['ASSISTANT_RASTER_PATH'];
    if (path != null) {
      await tester.runAsync(() async {
        final boundary =
            _rasterKey.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        final image = await boundary.toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(path).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }
    expect(tester.getRect(find.byType(TextField)).height, initialHeight);
    final expand = tester.getRect(
      find.byKey(const ValueKey('assistant-expand-prompt')),
    );
    final send = tester.getRect(
      find.byKey(const ValueKey('assistant-navigation-toggle')),
    );
    expect(expand.bottom, lessThanOrEqualTo(send.top));
    expect(tester.takeException(), isNull);
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets('fullscreen draft retains selection, previews and send guard '
        'scale$scale', (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(tester.view.resetViewInsets);
      final controller = TextEditingController.fromValue(
        const TextEditingValue(
          text: 'Synthetic draft',
          selection: TextSelection(baseOffset: 2, extentOffset: 8),
        ),
      );
      final focus = FocusNode();
      final chat = ValueNotifier(
        const AssistantChatState(
          fallbackChatId: 'draft',
          composerAttachments: [
            AssistantAttachment(
              id: 'audio',
              name: 'Synthetic recording',
              size: 1,
              type: 'audio/mp4',
              uploadState: AssistantAttachmentUploadState.error,
            ),
          ],
        ),
      );
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      addTearDown(chat.dispose);
      var sends = 0;
      await _pump(
        tester,
        controller,
        focus,
        chat: chat,
        scale: scale,
        dark: scale == 2,
        reduced: scale == 2,
        onSend: () async => sends++,
      );
      focus.requestFocus();
      await tester.pumpAndSettle();
      final preview = find.byType(AssistantAttachmentPreview).first;
      expect(
        tester.getRect(preview).bottom,
        lessThanOrEqualTo(tester.getRect(find.byType(TextField)).top),
      );
      await tester.tap(find.byKey(const ValueKey('assistant-expand-prompt')));
      await tester.pumpAndSettle();
      expect(find.byType(AssistantPromptEditor), findsOneWidget);
      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('assistant-fullscreen-prompt')),
      );
      expect(field.controller, same(controller));
      expect(
        controller.selection,
        const TextSelection(baseOffset: 2, extentOffset: 8),
      );
      controller.value = const TextEditingValue(
        text: 'Updated\nSynthetic draft',
        selection: TextSelection.collapsed(offset: 7),
      );
      chat.value = chat.value.copyWith(
        status: AssistantChatStatus.restoring,
        composerAttachments: [
          chat.value.composerAttachments.single.copyWith(
            uploadState: AssistantAttachmentUploadState.uploading,
          ),
        ],
      );
      await tester.pump();
      await tester.pump();
      expect(
        tester
            .widget<AssistantAttachmentPreview>(
              find.byType(AssistantAttachmentPreview).first,
            )
            .attachment
            .uploadState,
        AssistantAttachmentUploadState.uploading,
      );
      await tester.tap(find.byKey(const ValueKey('settings-route-back')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      expect(controller.text, 'Updated\nSynthetic draft');
      expect(controller.selection, const TextSelection.collapsed(offset: 7));
      expect(focus.hasFocus, isTrue);
      expect(sends, 0);
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await tester.pump();
      expect(sends, 0);
      chat.value = chat.value.copyWith(
        status: AssistantChatStatus.idle,
        composerAttachments: [
          chat.value.composerAttachments.single.copyWith(
            uploadState: AssistantAttachmentUploadState.uploaded,
          ),
        ],
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await tester.pump();
      expect(sends, 1);
      await tester.tap(find.byKey(const ValueKey('assistant-expand-prompt')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Delete: Synthetic recording'));
      await tester.pump();
      await tester.pump();
      expect(chat.value.composerAttachments, isEmpty);
      expect(find.byType(AssistantAttachmentPreview), findsNothing);
      expect(controller.selection, const TextSelection.collapsed(offset: 7));
      expect(sends, 1);
      await tester.tap(find.byKey(const ValueKey('settings-route-back')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  for (final reduced in [false, true]) {
    testWidgets(
      'generic action retains 52px and reversible hit area reduced$reduced',
      (tester) async {
        var taps = 0;
        var visible = false;
        late StateSetter update;
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                disableAnimations: reduced,
                textScaler: const TextScaler.linear(2),
              ),
              child: StatefulBuilder(
                builder: (context, setState) {
                  update = setState;
                  return Scaffold(
                    body: Center(
                      child: DockActionTransition(
                        identity: visible ? 'generic' : null,
                        slotKey: const ValueKey('generic-slot'),
                        child: visible
                            ? IconButton(
                                onPressed: () => taps++,
                                icon: const Icon(Icons.add),
                                tooltip: 'Synthetic generic',
                              )
                            : null,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        );
        update(() => visible = true);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 180));
        if (!reduced) {
          expect(
            find.byTooltip('Synthetic generic').hitTestable(),
            findsNothing,
          );
        }
        await tester.pump(const Duration(milliseconds: 200));
        expect(
          tester.getRect(find.byKey(const ValueKey('generic-slot'))).height,
          52,
        );
        await tester.tap(find.byTooltip('Synthetic generic'));
        expect(taps, 1);
        update(() => visible = false);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byTooltip('Synthetic generic').hitTestable(), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
