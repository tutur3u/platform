// Assistant feature parity module: targeted lint suppressions keep the
// storage helpers concise.
// ignore_for_file: always_use_package_imports

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/assistant_models.dart';

const assistantChatStorageKeyPrefix = 'mira-dashboard-chat-';
const assistantModelStorageKeyPrefix = 'mira-dashboard-model-';
const assistantThinkingModeStorageKeyPrefix = 'mira-dashboard-thinking-mode-';
const assistantCreditSourceStorageKeyPrefix = 'mira-dashboard-credit-source-';
const assistantWorkspaceContextStorageKeyPrefix =
    'mira-dashboard-workspace-context-';

class AssistantPreferences {
  Future<String?> loadChatId(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$assistantChatStorageKeyPrefix$wsId');
  }

  Future<void> saveChatId(String wsId, String chatId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$assistantChatStorageKeyPrefix$wsId', chatId);
  }

  Future<void> clearChatId(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$assistantChatStorageKeyPrefix$wsId');
  }

  Future<AssistantGatewayModel?> loadModel(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$assistantModelStorageKeyPrefix$wsId');
    if (raw == null || raw.isEmpty) return null;

    try {
      return AssistantGatewayModel.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
    } on Object {
      return null;
    }
  }

  Future<void> saveModel(String wsId, AssistantGatewayModel model) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$assistantModelStorageKeyPrefix$wsId',
      jsonEncode(model.toJson()),
    );
  }

  Future<AssistantThinkingMode?> loadThinkingMode(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$assistantThinkingModeStorageKeyPrefix$wsId');
    for (final mode in AssistantThinkingMode.values) {
      if (mode.name == raw) {
        return mode;
      }
    }
    return null;
  }

  Future<void> saveThinkingMode(
    String wsId,
    AssistantThinkingMode mode,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$assistantThinkingModeStorageKeyPrefix$wsId',
      mode.name,
    );
  }

  Future<AssistantCreditSource?> loadCreditSource(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$assistantCreditSourceStorageKeyPrefix$wsId');
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
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$assistantCreditSourceStorageKeyPrefix$wsId',
      source.name,
    );
  }

  Future<String?> loadWorkspaceContextId(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$assistantWorkspaceContextStorageKeyPrefix$wsId');
  }

  Future<void> saveWorkspaceContextId(String wsId, String contextId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$assistantWorkspaceContextStorageKeyPrefix$wsId',
      contextId,
    );
  }

  Future<void> clearWorkspaceContextId(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$assistantWorkspaceContextStorageKeyPrefix$wsId');
  }
}
