import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import 'background_reply_harness.dart';

void main() {
  testWidgets('switching the response mode stops the reply in flight', (
    tester,
  ) async {
    final h = BackgroundReplyHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await h.send(tester);
    expect(h.chat.state.isBusy, isTrue);
    expect(h.repository.stream.hasListener, isTrue);

    // The controls show under the prompt while the keyboard is up.
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pump();
    final mode = find.byKey(const ValueKey('assistant-composer-mode'));
    expect(find.descendant(of: mode, matching: find.text('Fast')), findsOne);

    await tester.tap(mode);
    await tester.pump();
    // The stopped reply's stream winds down at its next event, which no
    // longer reaches the transcript.
    h.repository.stream.add(
      const AssistantJsonStreamEvent({
        'type': 'text-delta',
        'id': 'a',
        'delta': 'Late Fast answer',
      }),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Late Fast answer'), findsNothing);
    expect(
      h.chat.state.messages
          .expand((message) => message.parts)
          .any((part) => part.text?.contains('Late Fast answer') ?? false),
      isFalse,
    );
    expect(
      h.pageContext.read<AssistantShellCubit>().state.thinkingMode,
      AssistantThinkingMode.thinking,
    );
  });
}
