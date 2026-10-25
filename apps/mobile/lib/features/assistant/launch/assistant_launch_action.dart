import 'package:equatable/equatable.dart';

enum AssistantLaunchKind { voice, prompt }

/// A system shortcut request (Siri, Shortcuts, launcher, App Actions).
///
/// [trusted] is true only for entries that the OS restricts to the user
/// (iOS App Intents, Android non-exported launcher shortcuts). Untrusted
/// entries require an in-app confirmation before the microphone opens and
/// only prefill prompts.
class AssistantLaunchAction extends Equatable {
  const AssistantLaunchAction({
    required this.id,
    required this.kind,
    required this.trusted,
    required this.createdAt,
    this.prompt,
  });

  static const maxPromptLength = 4000;

  final String id;
  final AssistantLaunchKind kind;
  final bool trusted;
  final DateTime createdAt;
  final String? prompt;

  bool get autoSendPrompt =>
      kind == AssistantLaunchKind.prompt && trusted && prompt != null;

  /// Parses a native payload. Unknown or malformed payloads are dropped.
  static AssistantLaunchAction? fromNative(
    Object? raw, {
    required DateTime receivedAt,
  }) {
    if (raw is! Map) return null;
    final id = raw['id'];
    if (id is! String || id.isEmpty || id.length > 128) return null;
    final kind = switch (raw['kind']) {
      'voice' => AssistantLaunchKind.voice,
      'prompt' => AssistantLaunchKind.prompt,
      _ => null,
    };
    if (kind == null) return null;
    final rawPrompt = raw['prompt'];
    var prompt = rawPrompt is String ? rawPrompt.trim() : null;
    if (prompt != null && prompt.isEmpty) prompt = null;
    if (prompt != null && prompt.length > maxPromptLength) {
      prompt = prompt.substring(0, maxPromptLength);
    }
    final createdMs = raw['createdAtMs'];
    final createdAt = createdMs is int
        ? DateTime.fromMillisecondsSinceEpoch(createdMs)
        : receivedAt;
    return AssistantLaunchAction(
      id: id,
      kind: kind,
      trusted: raw['trusted'] == true,
      createdAt: createdAt.isAfter(receivedAt) ? receivedAt : createdAt,
      prompt: kind == AssistantLaunchKind.prompt ? prompt : null,
    );
  }

  @override
  List<Object?> get props => [id, kind, trusted, createdAt, prompt];
}

/// A delivered request bound to the actor that was signed in at delivery.
class AssistantLaunchRequest extends Equatable {
  const AssistantLaunchRequest({required this.action, required this.actorId});

  final AssistantLaunchAction action;
  final String actorId;

  @override
  List<Object?> get props => [action, actorId];
}
