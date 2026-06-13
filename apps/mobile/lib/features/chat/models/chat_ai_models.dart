part of 'chat_models.dart';

class ChatAiSettings extends Equatable {
  const ChatAiSettings({
    required this.conversationId,
    this.enabled = false,
    this.autoReply = false,
    this.creditSource = ChatAiCreditSource.workspace,
    this.thinkingMode = ChatAiThinkingMode.fast,
    this.creditWsId,
    this.modelId,
    this.personalWorkspaceId,
    this.systemPrompt,
    this.updatedAt,
  });

  factory ChatAiSettings.fromJson(Map<String, dynamic> json) {
    return ChatAiSettings(
      conversationId:
          json['conversationId']?.toString() ??
          json['conversation_id']?.toString() ??
          '',
      enabled: json['enabled'] as bool? ?? false,
      autoReply:
          json['autoReply'] as bool? ?? json['auto_reply'] as bool? ?? false,
      creditSource: _creditSourceFromJson(
        json['creditSource'] ?? json['credit_source'],
      ),
      thinkingMode: _thinkingModeFromJson(
        json['thinkingMode'] ?? json['thinking_mode'],
      ),
      creditWsId:
          json['creditWsId']?.toString() ?? json['credit_ws_id']?.toString(),
      modelId: json['modelId']?.toString() ?? json['model_id']?.toString(),
      personalWorkspaceId:
          json['personalWorkspaceId']?.toString() ??
          json['personal_workspace_id']?.toString(),
      systemPrompt:
          json['systemPrompt'] as String? ?? json['system_prompt'] as String?,
      updatedAt: _dateFromJson(json['updatedAt'] ?? json['updated_at']),
    );
  }

  final String conversationId;
  final bool enabled;
  final bool autoReply;
  final ChatAiCreditSource creditSource;
  final ChatAiThinkingMode thinkingMode;
  final String? creditWsId;
  final String? modelId;
  final String? personalWorkspaceId;
  final String? systemPrompt;
  final DateTime? updatedAt;

  @override
  List<Object?> get props => [
    conversationId,
    enabled,
    autoReply,
    creditSource,
    thinkingMode,
    creditWsId,
    modelId,
    personalWorkspaceId,
    systemPrompt,
    updatedAt,
  ];
}

class ChatAiTokenUsage extends Equatable {
  const ChatAiTokenUsage({
    this.cachedInputTokens = 0,
    this.cachedOutputTokens = 0,
    this.costUsd = 0,
    this.imageInputCount = 0,
    this.imageOutputCount = 0,
    this.inputTokens = 0,
    this.outputTokens = 0,
    this.reasoningTokens = 0,
    this.searchCount = 0,
    this.totalTokens = 0,
  });

  factory ChatAiTokenUsage.fromJson(Map<String, dynamic> json) {
    return ChatAiTokenUsage(
      cachedInputTokens: _intFromJson(json['cachedInputTokens']) ?? 0,
      cachedOutputTokens: _intFromJson(json['cachedOutputTokens']) ?? 0,
      costUsd: _doubleFromJson(json['costUsd']),
      imageInputCount: _intFromJson(json['imageInputCount']) ?? 0,
      imageOutputCount: _intFromJson(json['imageOutputCount']) ?? 0,
      inputTokens: _intFromJson(json['inputTokens']) ?? 0,
      outputTokens: _intFromJson(json['outputTokens']) ?? 0,
      reasoningTokens: _intFromJson(json['reasoningTokens']) ?? 0,
      searchCount: _intFromJson(json['searchCount']) ?? 0,
      totalTokens: _intFromJson(json['totalTokens']) ?? 0,
    );
  }

  final int cachedInputTokens;
  final int cachedOutputTokens;
  final double costUsd;
  final int imageInputCount;
  final int imageOutputCount;
  final int inputTokens;
  final int outputTokens;
  final int reasoningTokens;
  final int searchCount;
  final int totalTokens;

  @override
  List<Object?> get props => [
    cachedInputTokens,
    cachedOutputTokens,
    costUsd,
    imageInputCount,
    imageOutputCount,
    inputTokens,
    outputTokens,
    reasoningTokens,
    searchCount,
    totalTokens,
  ];
}

class ChatAiMessageUsage extends Equatable {
  const ChatAiMessageUsage({
    required this.id,
    required this.role,
    required this.contentPreview,
    required this.usage,
    this.model,
    this.exact = false,
    this.createdAt,
  });

  factory ChatAiMessageUsage.fromJson(Map<String, dynamic> json) {
    return ChatAiMessageUsage(
      id: json['id']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      contentPreview: json['contentPreview']?.toString() ?? '',
      usage: ChatAiTokenUsage.fromJson(_mapFromJson(json['usage'])),
      model: json['model'] as String?,
      exact: json['exact'] as bool? ?? false,
      createdAt: _dateFromJson(json['createdAt']),
    );
  }

  final String id;
  final String role;
  final String contentPreview;
  final ChatAiTokenUsage usage;
  final String? model;
  final bool exact;
  final DateTime? createdAt;

  @override
  List<Object?> get props => [
    id,
    role,
    contentPreview,
    usage,
    model,
    exact,
    createdAt,
  ];
}

class ChatAiObservability extends Equatable {
  const ChatAiObservability({required this.totals, this.messages = const []});

  factory ChatAiObservability.fromJson(Map<String, dynamic> json) {
    final payload = _mapFromJson(json['observability'] ?? json);
    return ChatAiObservability(
      totals: ChatAiTokenUsage.fromJson(_mapFromJson(payload['totals'])),
      messages: _listFromJson(payload['messages'], ChatAiMessageUsage.fromJson),
    );
  }

  final ChatAiTokenUsage totals;
  final List<ChatAiMessageUsage> messages;

  @override
  List<Object?> get props => [totals, messages];
}
