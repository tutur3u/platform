import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const _model = AssistantGatewayModel(
  value: 'test/model',
  label: 'Test model',
  provider: 'test',
);
const _attachment = AssistantAttachment(
  id: 'file',
  name: 'Example.pdf',
  size: 12,
  type: 'application/pdf',
);

Widget _app({
  required TextEditingController controller,
  required FocusNode focus,
  AssistantChatState chat = const AssistantChatState(fallbackChatId: 'draft'),
  double scale = 1,
  double keyboard = 0,
  bool reducedMotion = false,
  bool localOnly = false,
  bool localBlocked = false,
  bool localGenerating = false,
  Future<void> Function()? onStopLocal,
  Future<void> Function()? onLocalModels,
  VoidCallback? onNavigation,
  VoidCallback? onClose,
  Future<void> Function()? onSend,
  Future<void> Function()? onMic,
  Future<void> Function()? onAttach,
  Future<void> Function()? onCredits,
  Future<void> Function(AssistantThinkingMode)? onThinking,
  Future<void> Function(String)? onRemove,
  AssistantVoiceCaptureCubit? capture,
  Future<void> Function()? onAttachVoice,
  Future<void> Function()? onSendVoice,
}) => MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(
      textScaler: TextScaler.linear(scale),
      viewInsets: EdgeInsets.only(bottom: keyboard),
      disableAnimations: reducedMotion,
    ),
    child: child!,
  ),
  home: shad.Theme(
    data: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
    child: Scaffold(
      body: Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: AssistantComposerDock(
            localOnly: localOnly,
            localBlocked: localBlocked,
            localGenerating: localGenerating,
            localModelLabel: localOnly ? 'Gemma 3 270M' : null,
            onStopLocal: onStopLocal,
            onOpenLocalModels: onLocalModels,
            voiceCapture: capture,
            onAttachVoice: onAttachVoice,
            onSendVoice: onSendVoice,
            chatState: chat,
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
              selectedModel: _model,
              availableModels: [_model],
            ),
            navigationExpanded: false,
            bottomInset: 0,
            isPersonalWorkspace: true,
            onModelSelected: (_) async {},
            onOpenCreditSourceSheet: onCredits ?? () async {},
            onThinkingModeChanged: onThinking ?? (_) async {},
            controller: controller,
            focusNode: focus,
            onOpenAttachments: onAttach ?? () async {},
            onToggleNavigation: onNavigation ?? () {},
            onCloseComposer: onClose ?? () {},
            onMicrophoneTap: onMic ?? () async {},
            onSend: onSend ?? () async {},
            onRemoveAttachment: onRemove ?? (_) async {},
          ),
        ),
      ),
    ),
  ),
);

class _Recorder implements AssistantVoiceRecorder {
  @override
  Future<bool> hasPermission() async => true;
  @override
  Future<void> start(String path) async {}
  @override
  Future<void> pause() async {}
  @override
  Future<void> resume() async {}
  @override
  Future<void> stop() async {}
  @override
  Stream<double> get levels => const Stream.empty();
  @override
  Future<void> dispose() async {}
}

class _Capture extends AssistantVoiceCaptureCubit {
  _Capture() : super(recorder: _Recorder());
  void show(AssistantVoiceCaptureStatus status) => emit(
    AssistantVoiceCaptureState(
      status: status,
      levels: const [0.2, 0.7],
      seconds: 9,
    ),
  );
}

void main() {
  testWidgets(
    'navbar reacts to draft and cancellation preserves dock identity',
    (tester) async {
      final controller = TextEditingController();
      final focus = FocusNode();
      final capture = _Capture();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);

      var sends = 0;
      var navigation = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          capture: capture,
          onSend: () async {
            sends++;
          },
          onNavigation: () {
            navigation++;
          },
        ),
      );
      final surface = tester.element(find.byType(AssistantDockSurface));
      final primary = find.byKey(const ValueKey('assistant-navigation-toggle'));
      await tester.tap(primary);
      expect(navigation, 1);
      controller.text = 'Unsent draft';
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
      expect(
        find.widgetWithIcon(IconButton, Icons.arrow_upward_rounded),
        findsNothing,
      );
      await tester.tap(primary);
      expect(sends, 1);
      capture.show(AssistantVoiceCaptureStatus.recording);
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
      expect(
        find.widgetWithIcon(IconButton, Icons.pause_rounded),
        findsNothing,
      );
      await tester.tap(find.byKey(const ValueKey('voice-cancel')));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
      expect(controller.text, 'Unsent draft');
      expect(tester.element(find.byType(AssistantDockSurface)), same(surface));
      expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
      controller.clear();
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.menu_rounded), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await capture.close();
    },
  );

  testWidgets(
    'local mode keeps dock identity, disables audio and uses native stop',
    (tester) async {
      final controller = TextEditingController(text: 'Private draft');
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      var sent = 0;
      var stopped = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          onSend: () async {
            sent++;
          },
        ),
      );
      final dock = tester.element(find.byType(AssistantComposerDock));
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          localOnly: true,
          localBlocked: true,
          localGenerating: true,
          onStopLocal: () async {
            stopped++;
          },
          onSend: () async {
            sent++;
          },
        ),
      );
      expect(tester.element(find.byType(AssistantComposerDock)), same(dock));
      expect(controller.text, 'Private draft');
      await tester.tap(find.byIcon(Icons.stop_rounded));
      expect(stopped, 1);
      expect(sent, 0);
      controller.clear();
      await tester.pumpWidget(
        _app(controller: controller, focus: focus, localOnly: true),
      );
      expect(
        tester
            .widget<IconButton>(
              find.widgetWithIcon(IconButton, Icons.mic_none_rounded),
            )
            .onPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'local composer exposes management while excluding attachments and credits',
    (tester) async {
      final controller = TextEditingController();
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      var opened = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          localOnly: true,
          onLocalModels: () async {
            opened++;
          },
        ),
      );
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.attach_file), findsNothing);
      expect(find.byIcon(Icons.toll_rounded), findsNothing);
      await tester.tap(find.byIcon(Icons.memory_rounded));
      await tester.pumpAndSettle();
      expect(opened, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'inline recording keeps same dock and paused actions at narrow width',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = TextEditingController(text: 'Retained draft');
      final focus = FocusNode();
      final capture = _Capture();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      var attach = 0;
      var send = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          capture: capture,
          scale: 3,
          onAttachVoice: () async {
            attach++;
          },
          onSendVoice: () async {
            send++;
          },
        ),
      );
      final surface = tester.element(find.byType(AssistantDockSurface));
      capture.show(AssistantVoiceCaptureStatus.recording);
      await tester.pumpAndSettle();
      expect(tester.element(find.byType(AssistantDockSurface)), same(surface));
      expect(find.byType(TextField), findsNothing);
      expect(
        find.byKey(const ValueKey('assistant-inline-voice-waveform')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('voice-attach')), findsNothing);
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await tester.pumpAndSettle();
      expect(capture.state.paused, isTrue);
      expect(find.byKey(const ValueKey('voice-restart')), findsOneWidget);
      expect(find.byTooltip('Resume recording'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('voice-attach')));
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      expect(attach, 1);
      expect(send, 1);
      expect(controller.text, 'Retained draft');
      expect(find.byType(Dialog), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await capture.close();
    },
  );

  testWidgets(
    'restoring retains draft and disables send including keyboard submission',
    (tester) async {
      final controller = TextEditingController(text: 'My unsent draft');
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      var sends = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          chat: const AssistantChatState(
            status: AssistantChatStatus.restoring,
            fallbackChatId: 'draft',
          ),
          onSend: () async {
            sends++;
          },
        ),
      );
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      expect(
        tester.widget<TextField>(find.byType(TextField)).onSubmitted,
        isNull,
      );
      expect(sends, 0);
      expect(controller.text, 'My unsent draft');
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          onSend: () async {
            sends++;
          },
        ),
      );
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      expect(sends, 1);
      expect(tester.takeException(), isNull);
    },
  );

  for (final width in [320.0, 600.0, 1024.0]) {
    for (final scale in [1.0, 2.0, 3.0]) {
      testWidgets(
        'single row remains usable at width $width and scale $scale',
        (tester) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final controller = TextEditingController();
          final focus = FocusNode();
          addTearDown(controller.dispose);
          addTearDown(focus.dispose);
          var nav = 0;
          var mic = 0;
          await tester.pumpWidget(
            _app(
              controller: controller,
              focus: focus,
              scale: scale,
              keyboard: 300,
              reducedMotion: true,
              onNavigation: () {
                nav++;
              },
              onMic: () async {
                mic++;
              },
            ),
          );
          expect(tester.widget<TextField>(find.byType(TextField)).maxLines, 1);
          expect(find.byIcon(Icons.fullscreen_rounded), findsNothing);
          for (final key in [
            'assistant-composer-options',
            'assistant-navigation-toggle',
          ]) {
            final size = tester.getSize(find.byKey(ValueKey(key)));
            expect(size.width, greaterThanOrEqualTo(44));
            expect(size.height, greaterThanOrEqualTo(44));
          }
          expect(tester.getRect(find.byType(TextField)).width, greaterThan(60));
          await tester.tap(find.byIcon(Icons.mic_none_rounded));
          await tester.tap(
            find.byKey(const ValueKey('assistant-navigation-toggle')),
          );
          expect(mic, 1);
          expect(nav, 1);
          expect(tester.takeException(), isNull);
          await tester.tap(
            find.byKey(const ValueKey('assistant-composer-options')),
          );
          await tester.pumpAndSettle();
          expect(find.text('Test model', findRichText: true), findsNothing);
          expect(find.text('Fast'), findsNothing);
          expect(find.text('Thinking'), findsNothing);
          expect(tester.takeException(), isNull);
          await tester.tapAt(const Offset(5, 5));
          await tester.pumpAndSettle();
        },
      );
    }
  }

  testWidgets('plus menu controls attachments, credits and close '
      'without clearing draft', (tester) async {
    final controller = TextEditingController(text: 'Unsent');
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    var attaches = 0;
    var credits = 0;
    var closes = 0;
    AssistantThinkingMode? mode;
    await tester.pumpWidget(
      _app(
        controller: controller,
        focus: focus,
        onAttach: () async {
          attaches++;
        },
        onCredits: () async {
          credits++;
        },
        onThinking: (value) async {
          mode = value;
        },
        onClose: () {
          closes++;
        },
      ),
    );
    Future<void> choose(String label) async {
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find
            .ancestor(
              of: find.text(label),
              matching: find.byWidgetPredicate(
                (widget) => widget is PopupMenuEntry,
              ),
            )
            .first,
      );
      await tester.pumpAndSettle();
    }

    await choose('Add attachments');
    expect(attaches, 1);
    expect(mode, isNull);
    await choose('Source: Personal');
    expect(credits, 1);
    await choose('Close prompt');
    expect(closes, 1);
    expect(controller.text, 'Unsent');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'attachments expose send and removable previews through the plus menu',
    (tester) async {
      final controller = TextEditingController();
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      String? removed;
      var sends = 0;
      await tester.pumpWidget(
        _app(
          controller: controller,
          focus: focus,
          chat: const AssistantChatState(
            fallbackChatId: 'draft',
            composerAttachments: [_attachment],
          ),
          onRemove: (id) async {
            removed = id;
          },
          onSend: () async {
            sends++;
          },
        ),
      );
      expect(find.byIcon(Icons.mic_none_rounded), findsNothing);
      await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
      expect(sends, 1);
      expect(find.text('Example.pdf'), findsNothing);
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Example.pdf'), findsOneWidget);
      final remove = find.widgetWithIcon(IconButton, Icons.close_rounded);
      expect(tester.getSize(remove).height, greaterThanOrEqualTo(44));
      await tester.tap(remove);
      await tester.pumpAndSettle();
      expect(removed, 'file');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'menu and navigation release prompt focus without clearing draft',
    (tester) async {
      final controller = TextEditingController(text: 'Unsent');
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      await tester.pumpWidget(_app(controller: controller, focus: focus));
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(focus.hasFocus, isTrue);
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pumpAndSettle();
      expect(focus.hasFocus, isFalse);
      expect(find.byIcon(Icons.flash_on_rounded), findsNothing);
      expect(find.byIcon(Icons.psychology_alt_rounded), findsNothing);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField));
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await tester.pump();
      expect(focus.hasFocus, isFalse);
      expect(controller.text, 'Unsent');
    },
  );

  testWidgets('empty keyboard submit never sends a blank message', (
    tester,
  ) async {
    final controller = TextEditingController();
    final focus = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    var sends = 0;
    await tester.pumpWidget(
      _app(
        controller: controller,
        focus: focus,
        onSend: () async {
          sends++;
        },
      ),
    );
    tester.widget<TextField>(find.byType(TextField)).onSubmitted!('');
    expect(sends, 0);
  });
}
