import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import 'background_reply_harness.dart';

void main() {
  testWidgets('actual page completes a remote reply while paused', (
    tester,
  ) async {
    final h = BackgroundReplyHarness();
    await h.mount(tester);
    addTearDown(() => h.dispose(tester));
    await h.send(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    h.repository.stream.add(
      const AssistantJsonStreamEvent({
        'type': 'text-delta',
        'id': 'block',
        'delta': 'Synthetic background answer',
      }),
    );
    unawaited(h.repository.stream.close());
    await tester.pump();
    expect(h.chat.state.status, AssistantChatStatus.idle);
    expect(
      h.chat.state.messages.last.parts.last.text,
      'Synthetic background answer',
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(h.chat.state.status, AssistantChatStatus.idle);
    expect(find.text('Synthetic background answer'), findsOneWidget);
  });
  testWidgets('background error remains visible after resume', (tester) async {
    final h = BackgroundReplyHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await h.send(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    h.repository.stream.addError(StateError('Synthetic stream failure'));
    unawaited(h.repository.stream.close());
    await tester.pump();
    expect(h.chat.state.status, AssistantChatStatus.error);
    expect(h.chat.state.error, contains('Synthetic stream failure'));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(h.chat.state.status, AssistantChatStatus.error);
    expect(h.repository.starts, 1);
  });
  testWidgets('resume during streaming preserves the same operation', (
    tester,
  ) async {
    final h = BackgroundReplyHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await h.send(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    h.repository.stream.add(
      const AssistantJsonStreamEvent({
        'type': 'text-delta',
        'id': 'a',
        'delta': 'Before resume ',
      }),
    );
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(milliseconds: 50));
    h.repository.stream.add(
      const AssistantJsonStreamEvent({
        'type': 'text-delta',
        'id': 'a',
        'delta': 'after resume',
      }),
    );
    unawaited(h.repository.stream.close());
    await tester.pumpAndSettle();
    expect(h.repository.starts, 1);
    expect(h.chat.state.status, AssistantChatStatus.idle);
    expect(
      h.chat.state.messages.last.parts.last.text,
      'Before resume after resume',
    );
  });
  for (final change in ['mode ABA', 'logout ABA', 'workspace ABA']) {
    testWidgets('actual page rejects late reply after $change', (tester) async {
      final h = BackgroundReplyHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await h.send(tester);
      final local = h.pageContext.read<AssistantLocalChatCubit>();
      if (change == 'mode ABA') {
        await tester.runAsync(() async {
          await local.select(assistantLocalModels.first.id);
          await local.select(null);
        });
      } else if (change == 'logout ABA') {
        final signedIn = h.auth.state;
        h.auth.change(const AuthState.unauthenticated());
        await tester.pump();
        h.auth.change(signedIn);
        await tester.pump();
      } else {
        h.workspace.change('synthetic-other-ws');
        await tester.pump();
        h.workspace.change('synthetic-ws');
        await tester.pump();
      }
      h.repository.stream.add(
        const AssistantJsonStreamEvent({
          'type': 'text-delta',
          'id': 'a',
          'delta': 'Rejected late answer',
        }),
      );
      unawaited(h.repository.stream.close());
      await tester.pump(const Duration(milliseconds: 500));
      expect(
        h.chat.state.messages
            .expand((m) => m.parts)
            .any((p) => p.text?.contains('Rejected late answer') ?? false),
        isFalse,
      );
      expect(find.text('Rejected late answer'), findsNothing);
    });
  }
}
