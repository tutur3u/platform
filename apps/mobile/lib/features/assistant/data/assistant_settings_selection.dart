import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';

/// A local settings choice is not a server receipt.
final class AssistantSettingsSelection {
  const AssistantSettingsSelection({
    required this.modelId,
    required this.creditSource,
    required this.creditWsId,
    required this.thinkingMode,
  });
  final String modelId;
  final AssistantCreditSource creditSource;
  final String creditWsId;
  final AssistantThinkingMode thinkingMode;

  Map<String, dynamic> toJson() => {
    'modelId': modelId,
    'creditSource': creditSource.name,
    'creditWsId': creditWsId,
    'thinkingMode': thinkingMode.name,
  };
}

enum AssistantSettingsDisposition {
  acknowledged,
  deferred,
  denied,
  unknown,
  stale,
}

typedef AssistantSettingsSelector =
    Future<AssistantSettingsDisposition> Function(
      AssistantSettingsSelection selection,
      bool Function() isCurrent,
    );

/// Captured before creation and admitted once, never patched after creation.
final class AssistantCreationSettingsPlan {
  AssistantCreationSettingsPlan(this.settings, this.isCurrent);
  final ChatInitialAiSettings settings;
  final bool Function() isCurrent;
  bool _used = false;
  ChatInitialAiSettings take() {
    if (_used || !isCurrent()) {
      throw const FormatException('Stale initial AI settings plan');
    }
    _used = true;
    return settings;
  }
}
