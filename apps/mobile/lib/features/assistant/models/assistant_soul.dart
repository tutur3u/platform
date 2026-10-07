part of 'assistant_models.dart';

class AssistantSoul extends Equatable {
  const AssistantSoul({
    this.name = 'Mira',
    this.tone,
    this.personality,
    this.boundaries,
    this.vibe,
    this.pushTone,
    this.chatTone,
  });

  factory AssistantSoul.fromJson(Map<String, dynamic>? json) => AssistantSoul(
    name: json?['name'] as String? ?? 'Mira',
    tone: json?['tone'] as String?,
    personality: json?['personality'] as String?,
    boundaries: json?['boundaries'] as String?,
    vibe: json?['vibe'] as String?,
    pushTone: json?['push_tone'] as String?,
    chatTone: json?['chat_tone'] as String?,
  );

  final String name;
  final String? tone;
  final String? personality;
  final String? boundaries;
  final String? vibe;
  final String? pushTone;
  final String? chatTone;

  AssistantSoul copyWith({
    String? name,
    String? tone,
    String? personality,
    String? boundaries,
    String? vibe,
    String? pushTone,
    String? chatTone,
  }) {
    return AssistantSoul(
      name: name ?? this.name,
      tone: tone ?? this.tone,
      personality: personality ?? this.personality,
      boundaries: boundaries ?? this.boundaries,
      vibe: vibe ?? this.vibe,
      pushTone: pushTone ?? this.pushTone,
      chatTone: chatTone ?? this.chatTone,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'tone': tone,
    'personality': personality,
    'boundaries': boundaries,
    'vibe': vibe,
    'push_tone': pushTone,
    'chat_tone': chatTone,
  };

  @override
  List<Object?> get props => [
    name,
    tone,
    personality,
    boundaries,
    vibe,
    pushTone,
    chatTone,
  ];
}
