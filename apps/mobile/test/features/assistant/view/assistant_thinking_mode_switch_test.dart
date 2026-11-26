import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_first_message_creation.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import 'background_reply_harness.dart';

/// Echoes settings selections like the server and records their bodies.
class _SettingsApi extends ApiClient {
  final patches = <Map<String, dynamic>>[];

  @override
  Future<Map<String, dynamic>> patchJsonAcknowledged(
    String path,
    Map<String, dynamic> body, {
    required String actorId,
    required bool Function() isCurrent,
  }) async {
    patches.add(body);
    final segments = Uri.parse(path).pathSegments;
    return {
      'settings': {'conversationId': segments[segments.length - 2], ...body},
    };
  }
}

class _CreationRepository extends ReplyRepository {
  _CreationRepository(this.api) : super(apiClient: api);

  final _SettingsApi api;
  final creations = <AssistantFirstMessageCreation>[];

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

const ValueKey<String> _mode = ValueKey('assistant-composer-mode');

Future<void> _showControls(WidgetTester tester) async {
  // In a thread the controls show under the prompt while typing.
  tester.view.viewInsets = const FakeViewPadding(bottom: 300);
  addTearDown(tester.view.resetViewInsets);
  await tester.pump();
}

AssistantShellCubit _shell(BackgroundReplyHarness h) =>
    h.pageContext.read<AssistantShellCubit>();

void main() {
  testWidgets('a new chat carries the switched mode in its creation', (
    tester,
  ) async {
    final repository = _CreationRepository(_SettingsApi());
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.fast);

    await tester.tap(find.byKey(_mode));
    await tester.pump();
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.thinking);
    // A new chat has no conversation to update yet.
    expect(repository.api.patches, isEmpty);

    await h.send(tester);
    expect(repository.creations.single.settings.thinkingMode, 'thinking');
    unawaited(h.repository.stream.close());
    await tester.pumpAndSettle();
  });

  testWidgets('an open conversation acknowledges the new mode', (tester) async {
    final repository = _CreationRepository(_SettingsApi());
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await h.send(tester);
    unawaited(h.repository.stream.close());
    await tester.pumpAndSettle();
    expect(h.chat.state.isBusy, isFalse);

    await _showControls(tester);
    await tester.tap(find.byKey(_mode));
    await tester.pumpAndSettle();
    expect(repository.api.patches.single['thinkingMode'], 'thinking');
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.thinking);
  });

  testWidgets('the mode waits while a reply is in flight', (tester) async {
    final repository = _CreationRepository(_SettingsApi());
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await h.send(tester);
    expect(h.chat.state.isBusy, isTrue);

    await _showControls(tester);
    final toggle = tester.widget<AppButton>(find.byKey(_mode));
    expect(toggle.onPressed, isNull);
    await tester.tap(find.byKey(_mode), warnIfMissed: false);
    await tester.pump();
    // The reply keeps streaming and nothing changes until it settles.
    expect(h.repository.stream.hasListener, isTrue);
    expect(h.chat.state.isBusy, isTrue);
    expect(repository.api.patches, isEmpty);
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.fast);

    unawaited(h.repository.stream.close());
    await tester.pumpAndSettle();
    expect(tester.widget<AppButton>(find.byKey(_mode)).onPressed, isNotNull);
  });

  testWidgets('the mode waits while messages are queued', (tester) async {
    final repository = _CreationRepository(_SettingsApi());
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    expect(h.chat.state.isBusy, isFalse);
    expect(tester.widget<AppButton>(find.byKey(_mode)).onPressed, isNotNull);

    // A queued message with no reply in flight still holds the mode.
    h.chat.emit(h.chat.state.copyWith(queuedMessages: const ['Next']));
    await tester.pumpAndSettle();
    expect(h.chat.state.isBusy, isFalse);
    expect(tester.widget<AppButton>(find.byKey(_mode)).onPressed, isNull);
    await tester.tap(find.byKey(_mode), warnIfMissed: false);
    await tester.pump();
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.fast);

    h.chat.emit(h.chat.state.copyWith(queuedMessages: const []));
    await tester.pumpAndSettle();
    expect(tester.widget<AppButton>(find.byKey(_mode)).onPressed, isNotNull);
  });

  testWidgets('a legacy conversation switches the mode without a write', (
    tester,
  ) async {
    final repository = _CreationRepository(_SettingsApi());
    final h = BackgroundReplyHarness(repository: repository);
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    // A legacy conversation sends the mode with each request.
    h.chat.emit(
      h.chat.state.copyWith(
        storedChatId: 'ai-chat-11111111-1111-4111-8111-111111111111',
      ),
    );
    await tester.pumpAndSettle();
    final mode = find.byKey(_mode);
    expect(tester.widget<AppButton>(mode).onPressed, isNotNull);

    await tester.tap(mode);
    await tester.pumpAndSettle();
    expect(_shell(h).state.thinkingMode, AssistantThinkingMode.thinking);
    expect(
      find.descendant(of: mode, matching: find.text('Thinking')),
      findsOneWidget,
    );
    expect(repository.api.patches, isEmpty);
  });
}
