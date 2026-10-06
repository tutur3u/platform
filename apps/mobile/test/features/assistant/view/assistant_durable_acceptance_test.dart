import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import 'background_reply_harness.dart';

void main() {
  testWidgets(
    'accepted replacement clears its composer after pause during cancellation',
    (tester) async {
      final h = BackgroundReplyHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      h.repository.holdCancellation();
      await h.send(tester);
      final controller = await _replace(tester);
      expect(h.repository.cancellationEntered, isTrue);
      h.pause(tester);
      h.repository.cancelGate!.complete();
      for (var i = 0; i < 6 && h.repository.starts < 2; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(h.repository.starts, 2);
      expect(controller.text, isEmpty);
      h.repository.replacement.add(
        const AssistantJsonStreamEvent({'type': 'start'}),
      );
      unawaited(h.repository.replacement.close());
      await tester.pump();
      expect(h.chat.state.status, AssistantChatStatus.idle);
      h.resume(tester);
      await tester.pumpAndSettle();
      expect(controller.text, isEmpty);
      expect(h.repository.starts, 2);
    },
  );

  for (final change in [
    'new draft',
    'paused new draft',
    'mode ABA',
    'actor ABA',
  ]) {
    testWidgets('deferred replacement preserves intent after $change', (
      tester,
    ) async {
      final h = BackgroundReplyHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      h.repository.holdCancellation();
      await h.send(tester);
      final controller = await _replace(tester);
      expect(h.repository.cancellationEntered, isTrue);
      if (change.endsWith('new draft')) {
        controller.text = 'New unsent draft';
        if (change == 'paused new draft') h.pause(tester);
      } else if (change == 'mode ABA') {
        final local = h.pageContext.read<AssistantLocalChatCubit>();
        await tester.runAsync(() async {
          await local.select(assistantLocalModels.first.id);
          await local.select(null);
        });
      } else {
        final original = h.auth.state;
        h.auth.change(const AuthState.unauthenticated());
        await tester.pump();
        h.auth.change(original);
        await tester.pump();
      }
      h.repository.cancelGate!.complete();
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      if (change.endsWith('new draft')) {
        expect(h.repository.starts, 2);
        expect(controller.text, 'New unsent draft');
        expect(
          h.chat.state.messages.last.parts.single.text,
          'Synthetic replacement',
        );
      } else {
        expect(h.repository.starts, 1);
        expect(h.chat.state.queuedMessages, isEmpty);
        if (change == 'mode ABA') {
          expect(controller.text, 'Synthetic replacement');
        }
      }
    });
  }
}

Future<TextEditingController> _replace(WidgetTester tester) async {
  final controller = await _readyComposer(tester);
  controller.text = 'Synthetic replacement';
  await tester.pump();
  await _readyComposer(tester);
  await tester.tap(
    find.byKey(const ValueKey('assistant-navigation-toggle')).hitTestable(),
  );
  await tester.pump(const Duration(milliseconds: 100));
  return controller;
}

Future<TextEditingController> _readyComposer(WidgetTester tester) async {
  // Slot publication and reversible action transitions need separate frames.
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    final primary = find
        .byKey(const ValueKey('assistant-navigation-toggle'))
        .hitTestable();
    final composer = find.byType(AssistantComposerDock);
    if (primary.evaluate().isNotEmpty && composer.evaluate().isNotEmpty) {
      return tester.widget<AssistantComposerDock>(composer).controller;
    }
    final launcher = find.byType(AssistantComposerFab).hitTestable();
    if (launcher.evaluate().isNotEmpty) await tester.tap(launcher);
  }
  fail('The actual composer primary action did not become interactive');
}
