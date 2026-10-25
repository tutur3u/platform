part of 'assistant_models.dart';

class AssistantMessage extends Equatable {
  const AssistantMessage({
    required this.id,
    required this.role,
    this.parts = const [],
    this.createdAt,
    this.liveTurnId,
    this.clientRequestId,
    this.reactions = const [],
    this.replyToMessageId,
    this.isPersisted = false,
    this.reactionRefreshRequired = false,
  });

  factory AssistantMessage.fromJson(Map<String, dynamic> json) =>
      AssistantMessage(
        id: json['id'] as String,
        role: json['role'] as String? ?? 'assistant',
        parts: (json['parts'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(AssistantMessagePart.fromJson)
            .toList(),
        createdAt: _parseDateTime(json['created_at']),
        liveTurnId: json['liveTurnId'] as String?,
        clientRequestId: json['clientRequestId'] as String?,
        reactions: (json['reactions'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ChatReactionSummary.fromJson)
            .toList(growable: false),
        replyToMessageId: json['replyToMessageId'] as String?,
        isPersisted: json['isPersisted'] == true,
        reactionRefreshRequired: json['reactionRefreshRequired'] == true,
      );

  final String id;
  final String role;
  final List<AssistantMessagePart> parts;
  final DateTime? createdAt;
  final String? liveTurnId;
  final String? clientRequestId;
  final List<ChatReactionSummary> reactions;
  final String? replyToMessageId;

  /// Only authoritative restores and validated native receipts set this.
  final bool isPersisted;
  final bool reactionRefreshRequired;

  AssistantMessage copyWith({
    String? id,
    String? role,
    List<AssistantMessagePart>? parts,
    DateTime? createdAt,
    String? liveTurnId,
    String? clientRequestId,
    List<ChatReactionSummary>? reactions,
    String? replyToMessageId,
    bool? isPersisted,
    bool? reactionRefreshRequired,
  }) {
    return AssistantMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      parts: parts ?? this.parts,
      createdAt: createdAt ?? this.createdAt,
      liveTurnId: liveTurnId ?? this.liveTurnId,
      clientRequestId: clientRequestId ?? this.clientRequestId,
      reactions: reactions ?? this.reactions,
      replyToMessageId: replyToMessageId ?? this.replyToMessageId,
      isPersisted: isPersisted ?? this.isPersisted,
      reactionRefreshRequired:
          reactionRefreshRequired ?? this.reactionRefreshRequired,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'parts': parts.map((part) => part.toJson()).toList(),
    'created_at': createdAt?.toIso8601String(),
    if (liveTurnId != null) 'liveTurnId': liveTurnId,
    if (clientRequestId != null) 'clientRequestId': clientRequestId,
    'reactions': reactions
        .map((r) => {'emoji': r.emoji, 'count': r.count, 'userIds': r.userIds})
        .toList(growable: false),
    if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
    'isPersisted': isPersisted,
    'reactionRefreshRequired': reactionRefreshRequired,
  };

  @override
  List<Object?> get props => [
    id,
    role,
    parts,
    createdAt,
    liveTurnId,
    clientRequestId,
    reactions,
    replyToMessageId,
    isPersisted,
    reactionRefreshRequired,
  ];
}

class AssistantMessagePart extends Equatable {
  const AssistantMessagePart({
    required this.type,
    this.text,
    this.toolName,
    this.toolCallId,
    this.state,
    this.input,
    this.output,
    this.sourceId,
    this.url,
    this.title,
    this.metadata,
    this.blockId,
  });

  factory AssistantMessagePart.fromJson(Map<String, dynamic> json) =>
      AssistantMessagePart(
        type: json['type'] as String,
        text: json['text'] as String?,
        toolName: json['toolName'] as String?,
        toolCallId: json['toolCallId'] as String?,
        state: json['state'] as String?,
        input: json['input'],
        output: json['output'],
        sourceId: json['sourceId'] as String?,
        url: json['url'] as String?,
        title: json['title'] as String?,
        metadata: json['metadata'] as Map<String, dynamic>?,
        blockId: json['blockId'] as String?,
      );

  final String type;
  final String? text;
  final String? toolName;
  final String? toolCallId;
  final String? state;
  final dynamic input;
  final dynamic output;
  final String? sourceId;
  final String? url;
  final String? title;
  final Map<String, dynamic>? metadata;
  final String? blockId;

  AssistantMessagePart copyWith({
    String? type,
    String? text,
    String? toolName,
    String? toolCallId,
    String? state,
    dynamic input,
    dynamic output,
    String? sourceId,
    String? url,
    String? title,
    Map<String, dynamic>? metadata,
    String? blockId,
  }) {
    return AssistantMessagePart(
      type: type ?? this.type,
      text: text ?? this.text,
      toolName: toolName ?? this.toolName,
      toolCallId: toolCallId ?? this.toolCallId,
      state: state ?? this.state,
      input: input ?? this.input,
      output: output ?? this.output,
      sourceId: sourceId ?? this.sourceId,
      url: url ?? this.url,
      title: title ?? this.title,
      metadata: metadata ?? this.metadata,
      blockId: blockId ?? this.blockId,
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    'text': text,
    'toolName': toolName,
    'toolCallId': toolCallId,
    'state': state,
    'input': input,
    'output': output,
    'sourceId': sourceId,
    'url': url,
    'title': title,
    'metadata': metadata,
    'blockId': blockId,
  };

  @override
  List<Object?> get props => [
    type,
    text,
    toolName,
    toolCallId,
    state,
    input,
    output,
    sourceId,
    url,
    title,
    metadata,
    blockId,
  ];
}
