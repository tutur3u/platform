import 'package:equatable/equatable.dart';

enum AssistantLiveConnectionStatus {
  disconnected,
  preparing,
  connecting,
  connected,
  reconnecting,
  error,
}

class AssistantLiveSeedPart extends Equatable {
  const AssistantLiveSeedPart({required this.text});

  factory AssistantLiveSeedPart.fromJson(Map<String, dynamic> json) =>
      AssistantLiveSeedPart(text: json['text'] as String? ?? '');

  final String text;

  Map<String, dynamic> toJson() => {'text': text};

  @override
  List<Object?> get props => [text];
}

class AssistantLiveSeedContent extends Equatable {
  const AssistantLiveSeedContent({
    required this.role,
    required this.parts,
  });

  factory AssistantLiveSeedContent.fromJson(Map<String, dynamic> json) =>
      AssistantLiveSeedContent(
        role: json['role'] as String? ?? 'user',
        parts: (json['parts'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(AssistantLiveSeedPart.fromJson)
            .toList(),
      );

  final String role;
  final List<AssistantLiveSeedPart> parts;

  Map<String, dynamic> toJson() => {
    'role': role,
    'parts': parts.map((part) => part.toJson()).toList(),
  };

  @override
  List<Object?> get props => [role, parts];
}

class AssistantLiveTokenEnvelope extends Equatable {
  const AssistantLiveTokenEnvelope({
    required this.token,
    required this.chatId,
    required this.scopeKey,
    required this.model,
    required this.sessionHandle,
    required this.seedHistory,
  });

  factory AssistantLiveTokenEnvelope.fromJson(Map<String, dynamic> json) =>
      AssistantLiveTokenEnvelope(
        token: json['token'] as String,
        chatId: json['chatId'] as String,
        scopeKey: json['scopeKey'] as String,
        model: json['model'] as String,
        sessionHandle: json['sessionHandle'] as String?,
        seedHistory: (json['seedHistory'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(AssistantLiveSeedContent.fromJson)
            .toList(),
      );

  final String token;
  final String chatId;
  final String scopeKey;
  final String model;
  final String? sessionHandle;
  final List<AssistantLiveSeedContent> seedHistory;

  @override
  List<Object?> get props => [
    token,
    chatId,
    scopeKey,
    model,
    sessionHandle,
    seedHistory,
  ];
}

class AssistantLiveFunctionCall extends Equatable {
  const AssistantLiveFunctionCall({
    required this.id,
    required this.name,
    required this.args,
  });

  final String id;
  final String name;
  final Map<String, dynamic> args;

  @override
  List<Object?> get props => [id, name, args];
}

class AssistantLiveInsightCard extends Equatable {
  const AssistantLiveInsightCard({
    required this.id,
    required this.title,
    required this.body,
    this.kind = 'info',
  });

  final String id;
  final String title;
  final String body;
  final String kind;

  @override
  List<Object?> get props => [id, title, body, kind];
}
