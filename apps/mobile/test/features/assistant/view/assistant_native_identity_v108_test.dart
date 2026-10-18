import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';

import 'assistant_native_identity_v108_harness.dart';
import 'assistant_settings_repair_harness.dart';
import 'assistant_v87_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('dev.fluttercommunity.plus/connectivity_status'),
          (_) async => null,
        );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('dev.fluttercommunity.plus/connectivity'),
          (_) async => ['wifi'],
        );
  });

  testWidgets(
    'native page retained draft reconciles original saved request without '
    'another POST',
    (tester) async {
      final api = NativeIdentityApi();
      final h = V87Harness(repository: NativeIdentityRepository(api));
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, repairChat),
      );
      await h.pageSend(tester, 'Saved but unseen');
      expect(api.posts, hasLength(1));
      expect(h.draft(tester).text, 'Saved but unseen');
      final original = api.posts.single['clientRequestId'];
      await h.pageSend(tester, 'Saved but unseen');
      expect(
        api.posts,
        hasLength(1),
        reason: 'repeated Send must only reconcile R, never allocate R2',
      );
      expect(h.draft(tester).text, isEmpty);
      expect(
        h.chat.state.messages.where((m) => m.role == 'user'),
        hasLength(1),
      );
      expect(h.chat.state.messages.single.clientRequestId, original);
    },
  );
  testWidgets('native unresolved request retains changed draft and attachments '
      'without another dispatch', (tester) async {
    final api = NativeIdentityApi()..hideSaved = true;
    final h = V87Harness(repository: NativeIdentityRepository(api));
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, repairChat),
    );
    await h.attach(tester);
    final originalAttachments = h.chat.state.composerAttachments;
    await h.pageSend(tester, 'Immutable original');
    final request = api.posts.single['clientRequestId'];
    await h.pageSend(tester, 'Changed draft');
    expect(api.posts, hasLength(1));
    expect(h.draft(tester).text, 'Changed draft');
    expect(h.chat.state.composerAttachments, originalAttachments);
    await h.pageSend(tester, 'Immutable original');
    expect(api.posts, hasLength(1));
    expect(h.draft(tester).text, 'Immutable original');
    await h.attach(tester);
    final changed = h.chat.state.composerAttachments;
    expect(changed.length, greaterThan(originalAttachments.length));
    api.hideSaved = false;
    await h.pageSend(tester, 'Immutable original');
    expect(api.posts, hasLength(1));
    expect(h.chat.state.composerAttachments, changed);
    expect(
      h.chat.state.messages
          .where((m) => m.role == 'user')
          .single
          .clientRequestId,
      request,
    );
  });

  testWidgets('native readback retirement A B A cannot clear current draft', (
    tester,
  ) async {
    final api = NativeIdentityApi();
    final h = V87Harness(repository: NativeIdentityRepository(api));
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, repairChat),
    );
    await h.pageSend(tester, 'Original A');
    final held = Completer<void>();
    api
      ..readGate = held
      ..readEntered = Completer<void>();
    await h.pageSend(tester, 'Original A');
    await tester.runAsync(() => api.readEntered.future);
    await tester.runAsync(() => h.chat.openChatById(repairWorkspace, chatB));
    // Retire the held A operation before returning to A.
    // B history must stay available while that old read is held.
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, repairChat),
    );
    h.draft(tester).text = 'Current A draft';
    held.complete();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 30)),
    );
    await tester.pumpAndSettle();
    expect(h.draft(tester).text, 'Current A draft');
    expect(api.posts, hasLength(1));
  });

  testWidgets(
    'native saved user then model error allows acknowledged equal-text '
    'follow-up',
    (tester) async {
      final api = NativeIdentityApi()
        ..loseReceipt = false
        ..modelError = true;
      final h = V87Harness(repository: NativeIdentityRepository(api));
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, repairChat),
      );
      await h.pageSend(tester, 'Same acknowledged text');
      expect(h.draft(tester).text, isEmpty);
      expect(api.posts, hasLength(1));
      api.modelError = false;
      await h.pageSend(tester, 'Same acknowledged text');
      expect(h.draft(tester).text, isEmpty);
      expect(api.posts, hasLength(2));
      expect(
        api.posts[0]['clientRequestId'],
        isNot(api.posts[1]['clientRequestId']),
      );
      expect(
        h.chat.state.messages.where((m) => m.role == 'user'),
        hasLength(2),
      );
    },
  );

  for (final json in [false, true]) {
    test('real native ${json ? 'JSON' : 'NDJSON'} adapter accepts canonical '
        'API microseconds', () async {
      final api = NativeIdentityApi()
        ..loseReceipt = false
        ..jsonResponse = json;
      final events = await ChatRepository(apiClient: api)
          .sendMessageStream(
            repairWorkspace,
            repairChat,
            content: 'Canonical',
            miraMode: true,
            clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
          )
          .toList();
      final user = events.whereType<ChatStreamMessageEvent>().first.message;
      expect(user.createdAt!.microsecond, 456);
      expect(api.posts, hasLength(1));
    });
    for (final timestamp in [
      '2026-10-18 00:00:00.123456+00',
      '2026-02-29T00:00:00Z',
      '2026-10-18T00:00:00+24:00',
    ]) {
      test('real native ${json ? 'JSON' : 'NDJSON'} rejects unnormalized or '
          'invalid timestamp $timestamp', () async {
        final api = NativeIdentityApi()
          ..loseReceipt = false
          ..jsonResponse = json
          ..timestamp = timestamp;
        await expectLater(
          ChatRepository(apiClient: api)
              .sendMessageStream(
                repairWorkspace,
                repairChat,
                content: 'Reject malformed',
                miraMode: true,
                clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
              )
              .toList(),
          throwsFormatException,
        );
        expect(api.posts, hasLength(1));
      });
    }
  }

  testWidgets(
    'native saved request with lost receipt and model error reconciles '
    'without generation retry',
    (tester) async {
      final api = NativeIdentityApi()..modelError = true;
      final h = V87Harness(repository: NativeIdentityRepository(api));
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, repairChat),
      );
      await h.pageSend(tester, 'Saved before model error');
      final original = api.posts.single['clientRequestId'];
      await h.pageSend(tester, 'Saved before model error');
      expect(api.posts, hasLength(1));
      expect(h.draft(tester).text, isEmpty);
      expect(h.chat.state.messages.single.clientRequestId, original);
    },
  );

  test('fresh native receipt read rejects foreign sender, changed text and '
      'attachment tuples', () async {
    final api = NativeIdentityApi()..loseReceipt = false;
    await ChatRepository(apiClient: api)
        .sendMessageStream(
          repairWorkspace,
          repairChat,
          content: 'Bound text',
          miraMode: true,
          clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        )
        .toList();
    final repository = AssistantRepository(
      apiClient: api,
      currentUserId: () => repairActor,
    );
    Future<AssistantMessage?> reconcile() =>
        repository.reconcileNativeUserSubmission(
          actorId: repairActor,
          wsId: repairWorkspace,
          chatId: repairChat,
          requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
          text: 'Bound text',
          attachments: const [],
          isCurrent: () => true,
        );
    final row = Map<String, dynamic>.from(api.saved.single);
    for (final changed in [
      {...row, 'senderId': chatB},
      {...row, 'content': 'Different saved text'},
      {
        ...row,
        'attachments': [
          {'filename': 'unexpected', 'path': 'unexpected'},
        ],
      },
    ]) {
      api.saved
        ..clear()
        ..add(changed);
      expect(await reconcile(), isNull);
    }
    expect(api.posts, hasLength(1));
  });

  test(
    'native receipt read actor ABA requires its captured generation lease',
    () async {
      final api = NativeIdentityApi()..loseReceipt = false;
      await ChatRepository(apiClient: api)
          .sendMessageStream(
            repairWorkspace,
            repairChat,
            content: 'Bound actor',
            miraMode: true,
            clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
          )
          .toList();
      var actor = repairActor;
      var generation = 1;
      final repository = AssistantRepository(
        apiClient: api,
        currentUserId: () => actor,
      );
      final gate = Completer<void>();
      api.readGate = gate;
      final result = repository.reconcileNativeUserSubmission(
        actorId: repairActor,
        wsId: repairWorkspace,
        chatId: repairChat,
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        text: 'Bound actor',
        attachments: const [],
        isCurrent: () => generation == 1,
      );
      await api.readEntered.future;
      actor = chatB;
      generation++;
      actor = repairActor;
      gate.complete();
      expect(await result, isNull);
      expect(api.posts, hasLength(1));
    },
  );
  for (final denied in [true, false]) {
    testWidgets(
      'native uncertain readback holds ${denied ? 'denied' : 'malformed'} '
      'receipt without another Send',
      (tester) async {
        final api = NativeIdentityApi();
        final h = V87Harness(repository: NativeIdentityRepository(api));
        addTearDown(() => h.dispose(tester));
        await h.mount(tester);
        await tester.runAsync(
          () => h.chat.openChatById(repairWorkspace, repairChat),
        );
        await h.pageSend(tester, 'Held original');
        if (denied) {
          api.denyRead = true;
        } else {
          api.saved.single['createdAt'] = '2026-02-29T00:00:00Z';
        }
        await h.pageSend(tester, 'Held original');
        expect(api.posts, hasLength(1));
        expect(h.draft(tester).text, 'Held original');
        expect(
          h.chat.state.messages.where((m) => m.role == 'user'),
          hasLength(1),
        );
      },
    );
  }
  testWidgets('native retired settings wait admits no POST across A B A', (
    tester,
  ) async {
    final api = NativeIdentityApi();
    final h = V87Harness(repository: NativeIdentityRepository(api));
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, repairChat),
    );
    final gate = Completer<void>();
    api.settingsGate = gate;
    await h.pageSend(tester, 'Retired pending request');
    expect(api.posts, isEmpty);
    await tester.runAsync(() => h.chat.openChatById(repairWorkspace, chatB));
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, repairChat),
    );
    gate.complete();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 40)),
    );
    await tester.pumpAndSettle();
    expect(api.posts, isEmpty);
    api.loseReceipt = false;
    await h.pageSend(tester, 'New current request');
    expect(api.posts, hasLength(1));
    expect(h.draft(tester).text, isEmpty);
  });
}
