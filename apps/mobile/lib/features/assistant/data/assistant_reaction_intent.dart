import 'package:mobile/core/validation/uuid.dart';

enum AssistantReactionBegin { recorded, alreadyPending, failed }

/// Desired state and identity retained until this operation is terminal.
class AssistantReactionIntent {
  const AssistantReactionIntent({
    required this.opId,
    required this.emoji,
    required this.present,
  });

  factory AssistantReactionIntent.decode(Object? raw) {
    if (raw is! Map ||
        raw['opId'] is! String ||
        !isUuid(raw['opId'] as String) ||
        raw['emoji'] is! String ||
        (raw['emoji'] as String).trim().isEmpty ||
        (raw['emoji'] as String).length > 64 ||
        raw['present'] is! bool) {
      throw const FormatException('Invalid pending reaction intent');
    }
    return AssistantReactionIntent(
      opId: raw['opId'] as String,
      emoji: raw['emoji'] as String,
      present: raw['present'] as bool,
    );
  }

  final String opId;
  final String emoji;
  final bool present;
  Map<String, Object> toJson() => {
    'opId': opId,
    'emoji': emoji,
    'present': present,
  };
}
