import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'assistant_chat_creation_harness.dart';

void main() {
  late CreationHarness h;
  late CreationActor actor;
  late CreationRepository repository;
  late AssistantChatCubit chat;
  late Completer<Map<String, dynamic>> response;
  late Completer<void> started;
  late List<Map<String, dynamic>> sends;
  setUp(() async {
    h = CreationHarness();
    await h.setup();
    actor = h.actor;
    repository = h.repository;
    chat = h.chat;
    response = h.response;
    started = h.started;
    sends = h.sends;
  });
  tearDown(() => h.close());
  Map<String, dynamic> receipt() => h.receipt();
  Future<AssistantSubmissionOutcome> send() => h.send();
  Future<void> attach() => h.attach();
  for (final attachmentFirst in [false, true]) {
    test('overlapping create shares one durable ID '
        '(attachmentFirst=$attachmentFirst)', () async {
      Future<AssistantSubmissionOutcome>? pending;
      if (!attachmentFirst) {
        pending = send();
        await Future<void>.delayed(Duration.zero);
      }
      final upload = attach();
      await started.future;
      pending ??= send();
      // Let the existing production debounce enter flush while HTTP is held.
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(h.posts, 1);
      response.complete(receipt());
      await upload;
      final outcome = await pending;
      expect(h.posts, 1);
      expect(outcome.acknowledged, true);
      expect(repository.uploads, [saved]);
      expect(chat.state.storedChatId, saved);
      expect(sends.single['conversationId'], saved);
      expect(sends.single['clientRequestId'], outcome.requestId);
      expect(chat.state.messages.first.clientRequestId, outcome.requestId);
      expect(
        chat.state.composerAttachments.single.storagePath,
        'chats/$saved/fixture.txt',
      );
      final followup = await send();
      expect(followup.acknowledged, true);
      expect(h.posts, 1);
      expect(sends.last['conversationId'], saved);
      expect(
        (sends.last['attachments'] as List).single,
        containsPair('path', 'chats/$saved/fixture.txt'),
      );
    });
  }
  for (final failure in [
    'cancel',
    'transport',
    'malformed',
    'workspace',
    'actor',
  ]) {
    test(
      'held shared creation isolates $failure without blind retry',
      () async {
        final pending = send();
        await Future<void>.delayed(Duration.zero);
        final upload = attach();
        await started.future;
        await Future<void>.delayed(const Duration(milliseconds: 300));
        Future<void>? returning;
        if (failure == 'cancel') {
          await chat.stopStreaming();
          expect((await pending).acknowledged, false);
          expect(
            chat.state.messages.single.parts.single.text,
            'Synthetic draft',
          );
          expect(chat.state.composerAttachments.single.isUploaded, false);
        } else if (failure == 'workspace' || failure == 'actor') {
          if (failure == 'actor') actor.id = otherActor;
          await chat.loadWorkspace(otherWs);
          actor.id = actorId;
          returning = chat.loadWorkspace(ws);
          await Future<void>.delayed(Duration.zero);
        }
        if (failure == 'transport') {
          response.completeError(
            const ApiException.transport(message: 'Synthetic unknown'),
          );
        } else if (failure == 'malformed') {
          response.complete({
            'conversation': {
              ...receipt()['conversation'] as Map<String, dynamic>,
              'title': 42,
            },
          });
        } else {
          response.complete(receipt());
        }
        await upload;
        if (returning != null) await returning;
        final outcome = await pending;
        expect(outcome.acknowledged, false);
        expect(h.posts, 1);
        expect(sends, isEmpty);
        if (failure == 'cancel') {
          expect(repository.uploads, [saved]);
          expect(chat.state.storedChatId, saved);
          expect((await send()).acknowledged, true);
          expect(h.posts, 1);
        } else {
          expect(repository.uploads, isEmpty);
          expect(await repository.hasUnknownChatCreation(ws), true);
          if (failure == 'transport' || failure == 'malformed') {
            expect(
              chat.state.messages.single.parts.single.text,
              'Synthetic draft',
            );
            expect(
              chat.state.composerAttachments.single.uploadState,
              AssistantAttachmentUploadState.error,
            );
          } else {
            expect(chat.state.workspaceId, ws);
            expect(chat.state.storedChatId, isNull);
            expect(chat.state.messages, isEmpty);
          }
          expect((await send()).acknowledged, false);
          expect(h.posts, 1);
        }
      },
    );
  }
  test(
    'confirmed explicit reset invalidates the prior acknowledged generation',
    () async {
      final upload = attach();
      await started.future;
      response.complete(receipt());
      await upload;
      final first = await send();
      expect(first.acknowledged, true);
      expect(
        await chat.resetConversation(ws, acknowledgeUnknownCreation: true),
        true,
      );
      final second = await send();
      expect(
        second.acknowledged,
        true,
        reason: chat.state.error ?? second.disposition.name,
      );
      expect(h.posts, 2);
      expect(chat.state.storedChatId, isNot(saved));
      expect(second.requestId, isNot(first.requestId));
    },
  );
}
