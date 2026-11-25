import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_streaming_indicator.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';

import '../../../helpers/design_render_harness.dart';

const _done = AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: 'read_calendar',
  toolCallId: 'calendar',
  state: 'output-available',
  input: {'query': 'today'},
  output: {'count': 3},
);
const _failed = AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: 'create_task',
  toolCallId: 'task',
  state: 'output-error',
  input: {'title': 'Send launch notes'},
);

const _messages = [
  AssistantMessage(
    id: 'user-1',
    role: 'user',
    parts: [AssistantMessagePart(type: 'text', text: 'Plan my afternoon')],
  ),
  AssistantMessage(
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      _done,
      AssistantMessagePart(
        type: 'text',
        text: 'You have three meetings. Your focus block starts at 15:00.',
      ),
    ],
  ),
  AssistantMessage(
    id: 'user-2',
    role: 'user',
    parts: [AssistantMessagePart(type: 'text', text: 'Add a follow-up task')],
  ),
  AssistantMessage(
    id: 'assistant-2',
    role: 'assistant',
    parts: [
      _failed,
      AssistantMessagePart(type: 'text', text: 'I could not create it.'),
    ],
  ),
];

const _sizes = {
  'phone': Size(390, 844),
  'tablet': Size(834, 1194),
  'desktop': Size(1440, 900),
};

Widget _thread(AssistantChatState state, {VoidCallback? onRetry}) =>
    SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: AssistantTranscriptSection(
            chatState: state,
            liveState: const AssistantLiveState(),
            assistantName: 'Mira',
            documentLayout: true,
            onRetry: onRetry ?? () {},
          ),
        ),
      ),
    );

Future<void> _pump(WidgetTester tester, Widget child, Brightness b) async {
  final settings = DesignRender.themes[b.name]!.$1;
  await tester.pumpWidget(
    DesignRenderApp(settings: settings, brightness: b, child: child),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final MapEntry(key: device, value: size) in _sizes.entries) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      testWidgets('Mira thread $device ${brightness.name}', (tester) async {
        DesignRender.setSize(tester, size);
        await _pump(
          tester,
          _thread(
            const AssistantChatState(
              fallbackChatId: 'chat',
              status: AssistantChatStatus.submitting,
              messages: [
                ..._messages,
                AssistantMessage(
                  id: 'user-3',
                  role: 'user',
                  parts: [
                    AssistantMessagePart(type: 'text', text: 'Try again'),
                  ],
                ),
              ],
            ),
          ),
          brightness,
        );
        expect(tester.takeException(), isNull);
        await DesignRender.capture(
          tester,
          'assistant-thread-$device-${brightness.name}',
        );
        expect(find.byType(AssistantStreamingIndicator), findsOneWidget);
        expect(
          find.byKey(const ValueKey('assistant-action-done')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('assistant-tools-error-icon')),
          findsOneWidget,
        );
      });
    }
  }

  testWidgets('failed tool step is announced as needing attention', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    DesignRender.setSize(tester, _sizes['phone']!);
    await _pump(
      tester,
      _thread(
        const AssistantChatState(fallbackChatId: 'chat', messages: _messages),
      ),
      Brightness.light,
    );
    final toggles = find.byKey(const ValueKey('assistant-tools-toggle'));
    expect(toggles, findsOneWidget);
    expect(
      tester.getSemantics(toggles).label,
      '1 step needs attention · 1 step',
    );
    semantics.dispose();
  });

  testWidgets('reply failure renders a retryable error card', (tester) async {
    DesignRender.setSize(tester, _sizes['phone']!);
    var retries = 0;
    await _pump(
      tester,
      _thread(
        onRetry: () => retries++,
        const AssistantChatState(
          fallbackChatId: 'chat',
          status: AssistantChatStatus.error,
          error: 'network',
          messages: [
            AssistantMessage(
              id: 'user-1',
              role: 'user',
              parts: [AssistantMessagePart(type: 'text', text: 'Hello')],
            ),
          ],
        ),
      ),
      Brightness.dark,
    );
    expect(tester.takeException(), isNull);
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-card')),
      findsOneWidget,
    );
    await DesignRender.capture(tester, 'assistant-thread-error-dark');
    await tester.tap(
      find.descendant(
        of: find.byKey(const ValueKey('assistant-reply-failure-card')),
        matching: find.byTooltip('Retry'),
      ),
    );
    expect(retries, 1);
  });

  testWidgets('streaming dots stay still with reduced motion', (tester) async {
    await tester.pumpWidget(
      DesignRenderApp(
        settings: DesignRender.themes['light']!.$1,
        brightness: Brightness.light,
        child: const MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: AssistantStreamingIndicator(label: 'Thinking...'),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Thinking...'), findsOneWidget);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });
}
