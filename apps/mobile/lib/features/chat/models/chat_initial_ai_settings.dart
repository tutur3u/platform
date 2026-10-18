import 'package:mobile/core/validation/uuid.dart';

/// Captured initial settings; only a matching creation receipt confirms them.
final class ChatInitialAiSettings {
  const ChatInitialAiSettings({
    required this.modelId,
    required this.creditSource,
    required this.creditWsId,
    required this.thinkingMode,
  });
  factory ChatInitialAiSettings.fromJson(Map<String, dynamic> raw) {
    final model = raw['modelId'];
    final credit = raw['creditWsId'];
    if (model is! String ||
        model.isEmpty ||
        model.trim() != model ||
        model.length > 255 ||
        !raw.containsKey('creditWsId') ||
        (credit != null && (credit is! String || !isUuid(credit))) ||
        !['workspace', 'personal'].contains(raw['creditSource']) ||
        !['fast', 'thinking'].contains(raw['thinkingMode'])) {
      throw const FormatException('Invalid initial AI settings');
    }
    return ChatInitialAiSettings(
      modelId: model,
      creditSource: raw['creditSource'] as String,
      creditWsId: credit as String?,
      thinkingMode: raw['thinkingMode'] as String,
    );
  }
  final String modelId;
  final String creditSource;
  final String? creditWsId;
  final String thinkingMode;
  Map<String, dynamic> toJson() => {
    'modelId': modelId,
    'creditSource': creditSource,
    'creditWsId': creditWsId,
    'thinkingMode': thinkingMode,
  };
  bool matches(ChatInitialAiSettings other) =>
      modelId == other.modelId &&
      creditSource == other.creditSource &&
      creditWsId == other.creditWsId &&
      thinkingMode == other.thinkingMode;

  void validateReceipt(
    Object? raw, {
    required String actorId,
    required String wsId,
    required String chatId,
  }) {
    if (raw is! Map<String, dynamic> ||
        raw['actorUserId'] != actorId ||
        raw['wsId'] != wsId ||
        raw['conversationId'] != chatId ||
        !isUuid(actorId) ||
        !isUuid(wsId) ||
        !isUuid(chatId) ||
        !matches(ChatInitialAiSettings.fromJson(raw))) {
      throw const FormatException('Unconfirmed initial AI settings');
    }
  }
}
