import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';

/// A captured initial tuple, not a server creation acknowledgment.
final class AssistantFirstMessageCreation {
  const AssistantFirstMessageCreation(this.settings, this.isCurrent);
  final ChatInitialAiSettings settings;
  final bool Function() isCurrent;
}
