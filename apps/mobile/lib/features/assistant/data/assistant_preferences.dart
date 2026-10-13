// Assistant feature parity module: targeted lint suppressions keep the
// storage helpers concise.
// ignore_for_file: always_use_package_imports

import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/assistant_models.dart';
import 'assistant_reset_preferences.dart';

const assistantChatStorageKeyPrefix = 'mira-dashboard-chat-';
const assistantModelStorageKeyPrefix = 'mira-dashboard-model-';
const assistantThinkingModeStorageKeyPrefix = 'mira-dashboard-thinking-mode-';
const assistantCreditSourceStorageKeyPrefix = 'mira-dashboard-credit-source-';
const assistantWorkspaceContextStorageKeyPrefix =
    'mira-dashboard-workspace-context-';
const assistantKeepLiveWhileBrowsingKeyPrefix =
    'mira-dashboard-keep-live-while-browsing-';

const _flashLitePreviewModel = 'gemini-3.1-flash-lite-preview';
const _flashLiteStableModel = 'gemini-3.1-flash-lite';

String _normalizeStoredModelId(String value) =>
    value.replaceFirst(_flashLitePreviewModel, _flashLiteStableModel);

class AssistantPreferences {
  AssistantPreferences({String? Function()? currentUserId})
    : _currentUserId = currentUserId ?? currentCacheUserId;

  final String? Function() _currentUserId;

  AssistantResetPreferences resetStore(
    String wsId, {
    String? actorId,
    bool Function()? isCurrent,
  }) {
    final actor = actorId ?? _currentUserId();
    if (actor == null) {
      throw const FormatException('Assistant actor is unavailable');
    }
    return AssistantResetPreferences(
      actorId: actor,
      workspaceId: wsId,
      isCurrent: () => _currentUserId() == actor && (isCurrent?.call() ?? true),
    );
  }

  static Future<T> serializeChatSelection<T>(
    String actorId,
    String wsId,
    Future<T> Function() work,
  ) => AssistantResetPreferences.serialized(
    '$actorId::mira-conversation-envelope::v1::$wsId',
    work,
  );

  Future<String?> _readResetPreference(String prefix, String wsId) async {
    if (_currentUserId() == null) return null;
    try {
      final value = await resetStore(wsId).readSelection();
      return prefix == assistantChatStorageKeyPrefix
          ? value.selectedChatId
          : value.contextId;
    } on Object {
      throw const FormatException('Assistant selection storage is unreadable');
    }
  }

  bool matchesResetActor(String actorId) => _currentUserId() == actorId;

  Future<bool> clearChatIdAcknowledged(
    String wsId, {
    required String actorId,
    required bool Function() isCurrent,
  }) async {
    if (!matchesResetActor(actorId) || !isCurrent()) return false;
    return await resetStore(
      wsId,
      actorId: actorId,
      isCurrent: isCurrent,
    ).update(changeSelected: true);
  }

  Future<bool> saveWorkspaceContextIdAcknowledged(
    String wsId,
    String contextId, {
    required String actorId,
    required bool Function() isCurrent,
  }) async {
    if (!matchesResetActor(actorId) || !isCurrent()) return false;
    return await resetStore(
      wsId,
      actorId: actorId,
      isCurrent: isCurrent,
    ).update(changeContext: true, contextId: contextId);
  }

  String? _key(String prefix, String wsId) {
    final userId = _currentUserId();
    return userId == null ? null : '$userId::$prefix$wsId';
  }

  Future<bool> loadKeepLiveWhileBrowsing(String wsId) async {
    final key = _key(assistantKeepLiveWhileBrowsingKeyPrefix, wsId);
    if (key == null) return false;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantKeepLiveWhileBrowsingKeyPrefix, wsId)) {
      return false;
    }
    return prefs.getBool(key) ?? false;
  }

  Future<void> saveKeepLiveWhileBrowsing(
    String wsId, {
    required bool value,
    bool Function()? shouldWrite,
  }) async {
    final key = _key(assistantKeepLiveWhileBrowsingKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantKeepLiveWhileBrowsingKeyPrefix, wsId) ||
        shouldWrite?.call() == false) {
      return;
    }
    await prefs.setBool(key, value);
  }

  Future<String?> loadChatId(String wsId) =>
      _readResetPreference(assistantChatStorageKeyPrefix, wsId);

  Future<void> saveChatId(
    String wsId,
    String chatId, {
    bool Function()? shouldWrite,
  }) => _writeSelectedChat(wsId, chatId, shouldWrite);

  Future<void> clearChatId(String wsId, {bool Function()? shouldWrite}) =>
      _writeSelectedChat(wsId, null, shouldWrite);

  Future<void> _writeSelectedChat(
    String wsId,
    String? chatId,
    bool Function()? shouldWrite,
  ) async {
    final actor = _currentUserId();
    if (actor == null) return;
    bool current() => shouldWrite?.call() ?? true;
    final acknowledged = await resetStore(
      wsId,
      actorId: actor,
      isCurrent: current,
    ).update(changeSelected: true, selectedChatId: chatId);
    if (!acknowledged && matchesResetActor(actor) && current()) {
      throw const FormatException(
        'Assistant selected identity was not confirmed',
      );
    }
  }

  Future<AssistantGatewayModel?> loadModel(String wsId) async {
    final key = _key(assistantModelStorageKeyPrefix, wsId);
    if (key == null) return null;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantModelStorageKeyPrefix, wsId)) return null;
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;

    try {
      final model = AssistantGatewayModel.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      final stableValue = _normalizeStoredModelId(model.value);
      final stableLabel = model.label == _flashLitePreviewModel
          ? _flashLiteStableModel
          : model.label;

      if (stableValue == model.value && stableLabel == model.label) {
        return model;
      }

      return AssistantGatewayModel(
        value: stableValue,
        label: stableLabel,
        provider: model.provider,
        description: model.description,
        context: model.context,
        disabled: model.disabled,
        tags: model.tags,
        inputPricePerToken: model.inputPricePerToken,
        outputPricePerToken: model.outputPricePerToken,
        maxTokens: model.maxTokens,
      );
    } on Object {
      return null;
    }
  }

  Future<void> saveModel(String wsId, AssistantGatewayModel model) async {
    final key = _key(assistantModelStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantModelStorageKeyPrefix, wsId)) return;
    await prefs.setString(key, jsonEncode(model.toJson()));
  }

  Future<AssistantThinkingMode?> loadThinkingMode(String wsId) async {
    final key = _key(assistantThinkingModeStorageKeyPrefix, wsId);
    if (key == null) return null;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantThinkingModeStorageKeyPrefix, wsId)) return null;
    final raw = prefs.getString(key);
    for (final mode in AssistantThinkingMode.values) {
      if (mode.name == raw) {
        return mode;
      }
    }
    return null;
  }

  Future<void> saveThinkingMode(String wsId, AssistantThinkingMode mode) async {
    final key = _key(assistantThinkingModeStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantThinkingModeStorageKeyPrefix, wsId)) return;
    await prefs.setString(key, mode.name);
  }

  Future<AssistantCreditSource?> loadCreditSource(String wsId) async {
    final key = _key(assistantCreditSourceStorageKeyPrefix, wsId);
    if (key == null) return null;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantCreditSourceStorageKeyPrefix, wsId)) return null;
    final raw = prefs.getString(key);
    for (final source in AssistantCreditSource.values) {
      if (source.name == raw) {
        return source;
      }
    }
    return null;
  }

  Future<void> saveCreditSource(
    String wsId,
    AssistantCreditSource source,
  ) async {
    final key = _key(assistantCreditSourceStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantCreditSourceStorageKeyPrefix, wsId)) return;
    await prefs.setString(key, source.name);
  }

  Future<String?> loadWorkspaceContextId(String wsId) =>
      _readResetPreference(assistantWorkspaceContextStorageKeyPrefix, wsId);

  Future<void> saveWorkspaceContextId(
    String wsId,
    String contextId, {
    bool Function()? shouldWrite,
  }) async {
    final actor = _currentUserId();
    if (actor == null) return;
    bool current() => matchesResetActor(actor) && (shouldWrite?.call() ?? true);
    if (!await resetStore(
          wsId,
          actorId: actor,
          isCurrent: current,
        ).update(changeContext: true, contextId: contextId) &&
        current()) {
      throw const FormatException('Assistant context was not confirmed');
    }
  }

  Future<void> clearWorkspaceContextId(String wsId) async {
    if (_currentUserId() == null) return;
    if (!await resetStore(wsId).update(changeContext: true)) {
      throw const FormatException(
        'Assistant context removal was not confirmed',
      );
    }
  }
}
