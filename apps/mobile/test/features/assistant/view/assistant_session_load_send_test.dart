import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_first_message_creation.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';

import 'background_reply_harness.dart';

const _personal = '55555555-5555-4555-8555-555555555555';

/// A FREE workspace, whose credits are locked, with a separate personal
/// workspace; the workspace credits answer only once released.
class _LockedRepository extends ReplyRepository {
  final creditsGate = Completer<void>();
  final creations = <AssistantFirstMessageCreation>[];

  @override
  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async => _personal;

  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    await creditsGate.future;
    return AssistantCredits(
      tier: wsId == _personal ? 'PRO' : 'FREE',
      remaining: 1000,
    );
  }

  @override
  Stream<AssistantStreamEvent> streamFirstChat({
    required AssistantFirstMessageCreation creation,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required String timezone,
    required ApiMutationAdmission admission,
  }) {
    creations.add(creation);
    return super.streamFirstChat(
      creation: creation,
      chatId: chatId,
      wsId: wsId,
      messages: messages,
      timezone: timezone,
      admission: admission,
    );
  }
}

void main() {
  testWidgets('a new chat waits for a locked session to resolve credits', (
    tester,
  ) async {
    final repository = _LockedRepository();
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    final shell = h.pageContext.read<AssistantShellCubit>();
    expect(shell.state.status, AssistantShellStatus.loading);
    expect(shell.sessionReady, isFalse);

    // Sending while the session still loads creates nothing and keeps the
    // draft.
    final composer = tester.widget<AssistantComposerDock>(
      find.byType(AssistantComposerDock),
    );
    composer.controller.text = 'Too early';
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('assistant-send')));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(repository.creations, isEmpty);
    expect(repository.starts, 0);
    expect(composer.controller.text, 'Too early');

    repository.creditsGate.complete();
    await tester.pumpAndSettle();
    expect(shell.state.status, AssistantShellStatus.loaded);
    expect(shell.state.workspaceCreditLocked, isTrue);

    // Once loaded, the new chat is created on personal credits.
    await h.send(tester);
    final settings = repository.creations.single.settings;
    expect(settings.creditSource, AssistantCreditSource.personal.name);
    expect(settings.creditWsId, _personal);
    unawaited(repository.stream.close());
    await tester.pumpAndSettle();
  });
}
