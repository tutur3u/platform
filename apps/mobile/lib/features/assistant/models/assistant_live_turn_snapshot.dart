import 'package:equatable/equatable.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';

/// A completed local turn remains visible until its history refresh succeeds.
class AssistantLiveTurnSnapshot extends Equatable {
  const AssistantLiveTurnSnapshot({
    required this.id,
    required this.userText,
    required this.userTranscript,
    required this.assistantText,
    required this.assistantTranscript,
    required this.parts,
    required this.createdAt,
    this.partsRevision = 0,
  });

  final String id;
  final String userText;
  final String userTranscript;
  final String assistantText;
  final String assistantTranscript;
  final AssistantLiveTurnParts parts;
  final DateTime createdAt;
  final int partsRevision;

  AssistantLiveTurnSnapshot updatedTools() => AssistantLiveTurnSnapshot(
    id: id,
    userText: userText,
    userTranscript: userTranscript,
    assistantText: assistantText,
    assistantTranscript: assistantTranscript,
    parts: parts,
    createdAt: createdAt,
    partsRevision: partsRevision + 1,
  );

  @override
  List<Object?> get props => [
    id,
    userText,
    userTranscript,
    assistantText,
    assistantTranscript,
    parts,
    createdAt,
    partsRevision,
  ];
}
