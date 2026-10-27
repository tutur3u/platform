import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_created_chat.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';

const _ws = '11111111-1111-4111-8111-111111111111';
const _actor = '22222222-2222-4222-8222-222222222222';
const _chat = '33333333-3333-4333-8333-333333333333';

class _Preferences extends AssistantPreferences {
  int writes = 0;
  @override
  Future<String?> loadChatId(String wsId) async => null;
  @override
  Future<void> saveChatId(
    String wsId,
    String chatId, {
    bool Function()? shouldWrite,
  }) async {
    writes++;
    throw StateError('The creation receipt already retained selection');
  }
}

class _Repository extends AssistantRepository {
  final creation = Completer<AssistantChatRecord>();
  final events = StreamController<AssistantStreamEvent>.broadcast();
  bool creating = false;
  ApiMutationAdmission? admitted;
  int sends = 0;
  String? dispatchedChat;
  @override
  String? get currentActorId => _actor;
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async => false;
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
  }) {
    creating = true;
    return creation.future;
  }

  @override
  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
    ApiMutationAdmission? admission,
  }) {
    admission?.check();
    admitted = admission;
    sends++;
    dispatchedChat = chatId;
    return events.stream;
  }
}

void main() {
  late _Repository repository;
  late _Preferences preferences;
  late AssistantChatCubit chat;
  setUp(() async {
    repository = _Repository();
    preferences = _Preferences();
    chat = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    await chat.loadWorkspace(_ws);
  });
  tearDown(() async {
    await chat.close();
    await repository.events.close();
  });
  Future<void> send({bool Function()? isCurrent}) => chat.submit(
    wsId: _ws,
    message: "Today's focus",
    modelId: 'google/model',
    thinkingMode: AssistantThinkingMode.fast,
    creditSource: AssistantCreditSource.workspace,
    workspaceContextId: _ws,
    timezone: 'Asia/Ho_Chi_Minh',
    isCurrent: isCurrent,
  );

  test(
    'starts empty-state creation without advancing the debounce clock',
    () async {
      await send();
      expect(repository.creating, isTrue);
      expect(repository.sends, 0);
      repository.creation.complete(const AssistantCreatedChat(id: _chat));
      await Future<void>.delayed(Duration.zero);
      expect(repository.sends, 1);
      expect(repository.dispatchedChat, _chat);
      expect(preferences.writes, 0);
      expect(chat.state.storedChatId, _chat);
      expect(chat.state.creationOutcomeUnknown, isFalse);
      expect(repository.admitted, isNotNull);
    },
  );

  test('a superseded create receipt cannot dispatch a message', () async {
    var current = true;
    await send(isCurrent: () => current);
    expect(repository.creating, isTrue);
    current = false;
    repository.creation.complete(const AssistantCreatedChat(id: _chat));
    await Future<void>.delayed(Duration.zero);
    expect(repository.sends, 0);
    expect(preferences.writes, 0);
  });

  test('an uncertain creation retains its hold and never dispatches', () async {
    await send();
    repository.creation.completeError(const FormatException('Missing receipt'));
    await Future<void>.delayed(Duration.zero);
    expect(repository.sends, 0);
    expect(chat.state.creationOutcomeUnknown, isTrue);
    expect(chat.state.status, AssistantChatStatus.error);
  });
}
