// Assistant feature parity module: targeted lint suppressions keep the
// storage helpers concise.
// ignore_for_file: always_use_package_imports

import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/assistant_models.dart';

const assistantChatStorageKeyPrefix = 'mira-dashboard-chat-';
const assistantModelStorageKeyPrefix = 'mira-dashboard-model-';
const assistantThinkingModeStorageKeyPrefix = 'mira-dashboard-thinking-mode-';
const assistantCreditSourceStorageKeyPrefix = 'mira-dashboard-credit-source-';
const assistantWorkspaceContextStorageKeyPrefix =
    'mira-dashboard-workspace-context-';

const _flashLitePreviewModel = 'gemini-3.1-flash-lite-preview';
const _flashLiteStableModel = 'gemini-3.1-flash-lite';

String _normalizeStoredModelId(String value) =>
    value.replaceFirst(_flashLitePreviewModel, _flashLiteStableModel);

class AssistantPreferences {
  AssistantPreferences({String? Function()? currentUserId})
    : _currentUserId = currentUserId ?? currentCacheUserId;

  final String? Function() _currentUserId;

  String? _key(String prefix, String wsId) {
    final userId = _currentUserId();
    return userId == null ? null : '$userId::$prefix$wsId';
  }

  Future<String?> loadChatId(String wsId) async {
    final key = _key(assistantChatStorageKeyPrefix, wsId);
    if (key == null) return null;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantChatStorageKeyPrefix, wsId)) return null;
    return prefs.getString(key);
  }

  Future<void> saveChatId(
    String wsId,
    String chatId, {
    bool Function()? shouldWrite,
  }) async {
    final key = _key(assistantChatStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantChatStorageKeyPrefix, wsId) ||
        shouldWrite?.call() == false) {
      return;
    }
    await prefs.setString(key, chatId);
  }

  Future<void> clearChatId(String wsId, {bool Function()? shouldWrite}) async {
    final key = _key(assistantChatStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantChatStorageKeyPrefix, wsId) ||
        shouldWrite?.call() == false) {
      return;
    }
    await prefs.remove(key);
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

  Future<String?> loadWorkspaceContextId(String wsId) async {
    final key = _key(assistantWorkspaceContextStorageKeyPrefix, wsId);
    if (key == null) return null;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantWorkspaceContextStorageKeyPrefix, wsId)) {
      return null;
    }
    return prefs.getString(key);
  }

  Future<void> saveWorkspaceContextId(
    String wsId,
    String contextId, {
    bool Function()? shouldWrite,
  }) async {
    final key = _key(assistantWorkspaceContextStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantWorkspaceContextStorageKeyPrefix, wsId) ||
        shouldWrite?.call() == false) {
      return;
    }
    await prefs.setString(key, contextId);
  }

  Future<void> clearWorkspaceContextId(String wsId) async {
    final key = _key(assistantWorkspaceContextStorageKeyPrefix, wsId);
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (key != _key(assistantWorkspaceContextStorageKeyPrefix, wsId)) return;
    await prefs.remove(key);
  }
}
