import 'dart:async';

import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Captured before I/O; never transferred to a different actor or selection.
final class AssistantChatCacheOrigin {
  const AssistantChatCacheOrigin({
    required this.key,
    required this.epoch,
    required this.revision,
    required this.isCurrent,
  });
  final CacheKey key;
  final int epoch;
  final int revision;
  final bool Function() isCurrent;
  void checkScope() {
    if (!isCurrent()) throw const AssistantChatCacheCancellation();
  }
}

final class AssistantChatCacheCancellation implements Exception {
  const AssistantChatCacheCancellation();
}

final class AssistantChatCacheStorageFailure implements Exception {
  const AssistantChatCacheStorageFailure(this.diagnostics);
  final SafeErrorDiagnostics? diagnostics;
}

enum AssistantChatCacheStatus { published, cancelled, failed }

final class AssistantChatCachePublication {
  const AssistantChatCachePublication(this.status, {this.diagnostics});
  final AssistantChatCacheStatus status;
  final SafeErrorDiagnostics? diagnostics;
}

enum AssistantChatRouteKind { native, legacy }

enum AssistantSubmissionDisposition { acknowledged, denied, unknown, stale }

final class AssistantSubmissionOutcome {
  const AssistantSubmissionOutcome._(
    this.disposition,
    this.requestId,
    this.messageId,
  );
  const AssistantSubmissionOutcome.denied()
    : this._(AssistantSubmissionDisposition.denied, null, null);
  const AssistantSubmissionOutcome.unknown()
    : this._(AssistantSubmissionDisposition.unknown, null, null);
  const AssistantSubmissionOutcome.stale()
    : this._(AssistantSubmissionDisposition.stale, null, null);
  factory AssistantSubmissionOutcome.acknowledged(
    String requestId,
    String messageId,
  ) {
    if (!isUuid(requestId) ||
        requestId.trim() != requestId ||
        !isUuid(messageId) ||
        messageId.trim() != messageId) {
      throw const FormatException(
        'Invalid assistant submission acknowledgment',
      );
    }
    return AssistantSubmissionOutcome._(
      AssistantSubmissionDisposition.acknowledged,
      requestId,
      messageId,
    );
  }
  final AssistantSubmissionDisposition disposition;
  final String? requestId;
  final String? messageId;
  bool get acknowledged =>
      disposition == AssistantSubmissionDisposition.acknowledged;
}

/// Prefixes identify legacy AI storage. Bare UUIDs identify native Chat
/// storage;
/// a permission failure never changes the selected store or conversation.
class AssistantChatRoute {
  const AssistantChatRoute._(this.kind, this.conversationId, this.storageId);
  factory AssistantChatRoute.parse(String id) {
    if (id.trim() != id) {
      throw const FormatException('Invalid assistant chat ID');
    }
    for (final prefix in ['ai-chat-', 'legacy-ai-']) {
      if (id.startsWith(prefix)) {
        final uuid = normalizeUuid(id.substring(prefix.length));
        if (uuid == null ||
            id.substring(prefix.length).trim() != id.substring(prefix.length)) {
          throw const FormatException('Invalid assistant chat ID');
        }
        return AssistantChatRoute._(AssistantChatRouteKind.legacy, id, uuid);
      }
    }
    if (!isUuid(id)) throw const FormatException('Invalid assistant chat ID');
    return AssistantChatRoute._(AssistantChatRouteKind.native, id, id);
  }
  final AssistantChatRouteKind kind;
  final String conversationId;
  final String storageId;
}

void requireAssistantSettingsReceipt(
  Map<String, dynamic> payload, {
  required String chatId,
}) {
  final settings = payload['settings'];
  if (settings is! Map<String, dynamic> ||
      settings['conversationId'] != chatId) {
    throw const FormatException('Invalid assistant settings receipt');
  }
}

void requireAssistantMessageReceipts(
  List<ChatMessage> messages, {
  required String conversationId,
}) {
  final ids = <String>{};
  for (final message in messages) {
    if (!isUuid(message.id) ||
        message.conversationId != conversationId ||
        !ids.add(message.id)) {
      throw const FormatException('Invalid assistant message receipt');
    }
  }
}

/// The native message endpoint uses stored settings and accepts no per-turn
/// overrides. Reading settings is authorized separately from managing them.
void requireAssistantSendSettings(
  Map<String, dynamic> payload, {
  required String chatId,
  required String modelId,
  required String creditSource,
  required String thinkingMode,
  String? creditWsId,
}) {
  requireAssistantSettingsReceipt(payload, chatId: chatId);
  final settings = payload['settings'] as Map<String, dynamic>;
  if (settings['modelId'] != modelId ||
      settings['creditSource'] != creditSource ||
      settings['thinkingMode'] != thinkingMode ||
      (creditWsId != null && settings['creditWsId'] != creditWsId)) {
    throw const FormatException(
      'Selected assistant request settings are not stored for this '
      'conversation',
    );
  }
}

String? assistantClientRequestId(Map<String, dynamic> metadata) {
  final value = metadata['clientRequestId'];
  if (value == null) return null;
  if (value is! String || !isUuid(value) || value.trim() != value) {
    throw const FormatException('Invalid assistant original request ID');
  }
  return value;
}

final class AssistantCreationUncertainException implements Exception {
  const AssistantCreationUncertainException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Shared across repository instances, with independent actor/workspace locks.
/// Legacy preferences publish speculative cache values before host completion.
final class AssistantCreationMarker {
  static final Map<String, Future<void>> _transitions = {};
  static final Set<String> _failedScopes = {};

  static Future<SharedPreferences> load(String key) async {
    try {
      return await SharedPreferences.getInstance();
    } on Object {
      _failedScopes.add(key);
      throw const AssistantCreationUncertainException(
        'Assistant creation marker is unavailable',
      );
    }
  }

  static Future<T> serialized<T>(
    String key,
    Future<T> Function() action,
  ) async {
    final prior = _transitions[key];
    final done = Completer<void>();
    _transitions[key] = done.future;
    if (prior != null) await prior;
    try {
      return await action();
    } finally {
      done.complete();
      if (identical(_transitions[key], done.future)) {
        unawaited(_transitions.remove(key));
      }
    }
  }

  static Future<bool> unknown(
    SharedPreferences prefs,
    String key,
    void Function() checkScope,
  ) async {
    try {
      await prefs.reload();
      checkScope();
      return _failedScopes.contains(key) || prefs.getString(key) != 'clear:v1';
    } on Object {
      _failedScopes.add(key);
      throw const AssistantCreationUncertainException(
        'Assistant creation marker is unreadable',
      );
    }
  }

  static Future<void> write(
    SharedPreferences prefs,
    String key,
    String status,
    void Function() checkScope, {
    bool informed = false,
  }) async {
    try {
      checkScope();
      if (!await prefs.setString(key, status)) {
        throw const AssistantCreationUncertainException(
          'Assistant creation marker could not be saved',
        );
      }
      checkScope();
      await prefs.reload();
      checkScope();
      if (prefs.getString(key) != status) {
        throw const AssistantCreationUncertainException(
          'Assistant creation marker was not confirmed',
        );
      }
      if (informed) _failedScopes.remove(key);
    } on Object {
      _failedScopes.add(key);
      throw const AssistantCreationUncertainException(
        'Assistant creation marker could not be confirmed',
      );
    }
  }

  static void hold(String key) => _failedScopes.add(key);
}

({
  List<AssistantMessage> messages,
  Map<String, List<AssistantAttachment>> attachments,
})?
reconcileAssistantUserReceipt(
  List<AssistantMessage> messages,
  Map<String, List<AssistantAttachment>> attachments, {
  required String requestId,
  required String savedId,
  required String savedText,
}) {
  if (!isUuid(requestId) || !isUuid(savedId)) {
    throw const FormatException('Invalid assistant user acknowledgement');
  }
  final candidates = messages
      .where(
        (m) =>
            m.role == 'user' &&
            (m.id == requestId || m.clientRequestId == requestId),
      )
      .toList();
  if (candidates.isEmpty) return null;
  if (candidates.length != 1 ||
      candidates.single.parts
              .where((p) => p.type == 'text')
              .map((p) => p.text ?? '')
              .join('\n\n')
              .trim() !=
          savedText) {
    throw const FormatException(
      'Assistant acknowledgement differs from original message',
    );
  }
  final prior = candidates.single;
  final nextAttachments = Map<String, List<AssistantAttachment>>.from(
    attachments,
  );
  final retained = nextAttachments.remove(prior.id);
  if (retained != null) nextAttachments[savedId] = retained;
  return (
    messages: messages
        .map(
          (m) => m.id == prior.id
              ? m.copyWith(id: savedId, clientRequestId: requestId)
              : m,
        )
        .toList(),
    attachments: nextAttachments,
  );
}
