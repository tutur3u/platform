import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Pending names are durable local intent, never authoritative server values.
class AssistantNameIntent extends Equatable {
  const AssistantNameIntent({
    required this.id,
    required this.name,
    required this.status,
    required this.createdAt,
  });
  final String id;
  final String name;
  final PendingMutationStatus status;
  final DateTime createdAt;
  @override
  List<Object?> get props => [id, name, status, createdAt];
}

class AssistantSoulSnapshot extends Equatable {
  AssistantSoulSnapshot({
    this.verifiedSoul,
    List<AssistantNameIntent> pendingIntents = const [],
  }) : pendingIntents = List.unmodifiable(pendingIntents);

  /// Null explicitly means that no verified snapshot is available.
  final AssistantSoul? verifiedSoul;
  final List<AssistantNameIntent> pendingIntents;

  /// A display default carries no server confirmation or queue acknowledgment.
  AssistantSoul get displaySoul => verifiedSoul ?? const AssistantSoul();
  @override
  List<Object?> get props => [verifiedSoul, pendingIntents];
}
