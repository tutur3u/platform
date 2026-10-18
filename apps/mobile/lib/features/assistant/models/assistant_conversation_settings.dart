part of 'assistant_models.dart';

/// Native stored settings, including an explicit server-default credit scope.
final class AssistantConversationSettings extends Equatable {
  const AssistantConversationSettings({
    required this.modelId,
    required this.creditSource,
    required this.creditWsId,
    required this.thinkingMode,
  });
  factory AssistantConversationSettings.fromJson(Map<String, dynamic> json) {
    final model = json['modelId'];
    final credit = json['creditWsId'];
    if (model is! String ||
        model.isEmpty ||
        model.trim() != model ||
        !json.containsKey('creditWsId') ||
        (credit != null && (credit is! String || !isUuid(credit)))) {
      throw const FormatException('Invalid native conversation settings');
    }
    return AssistantConversationSettings(
      modelId: model,
      creditSource: switch (json['creditSource']) {
        'workspace' => AssistantCreditSource.workspace,
        'personal' => AssistantCreditSource.personal,
        _ => throw const FormatException('Invalid native credit source'),
      },
      creditWsId: credit as String?,
      thinkingMode: switch (json['thinkingMode']) {
        'fast' => AssistantThinkingMode.fast,
        'thinking' => AssistantThinkingMode.thinking,
        _ => throw const FormatException('Invalid native thinking mode'),
      },
    );
  }
  final String modelId;
  final AssistantCreditSource creditSource;
  final String? creditWsId;
  final AssistantThinkingMode thinkingMode;
  Map<String, dynamic> toJson() => {
    'modelId': modelId,
    'creditSource': creditSource.name,
    'creditWsId': creditWsId,
    'thinkingMode': thinkingMode.name,
  };
  @override
  List<Object?> get props => [modelId, creditSource, creditWsId, thinkingMode];
}
