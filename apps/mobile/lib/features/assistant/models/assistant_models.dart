// Assistant feature parity module: model declarations favor compactness over
// local lint-perfect ordering.
// ignore_for_file: sort_constructors_first

import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';

enum AssistantCreditSource { workspace, personal }

enum AssistantThinkingMode { fast, thinking }

enum AssistantChatStatus { idle, restoring, submitting, streaming, error }

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

class AssistantTaskInsight extends Equatable {
  const AssistantTaskInsight({
    required this.id,
    required this.name,
    this.description,
    this.priority = 'normal',
    this.endDate,
    this.createdAt,
    this.listId,
    this.listName,
    this.listStatus,
    this.boardId,
    this.boardName,
    this.workspaceId,
  });

  factory AssistantTaskInsight.fromJson(Map<String, dynamic> json) =>
      AssistantTaskInsight(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Untitled task',
        description: json['description'] as String?,
        priority: json['priority'] as String? ?? 'normal',
        endDate: _parseDateTime(json['end_date']),
        createdAt: _parseDateTime(json['created_at']),
        listId: json['list_id'] as String?,
        listName: json['list_name'] as String?,
        listStatus: json['list_status'] as String?,
        boardId: json['board_id'] as String?,
        boardName: json['board_name'] as String?,
        workspaceId: json['ws_id'] as String?,
      );

  final String id;
  final String name;
  final String? description;
  final String priority;
  final DateTime? endDate;
  final DateTime? createdAt;
  final String? listId;
  final String? listName;
  final String? listStatus;
  final String? boardId;
  final String? boardName;
  final String? workspaceId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'priority': priority,
    'end_date': endDate?.toIso8601String(),
    'created_at': createdAt?.toIso8601String(),
    'list_id': listId,
    'list_name': listName,
    'list_status': listStatus,
    'board_id': boardId,
    'board_name': boardName,
    'ws_id': workspaceId,
  };

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    priority,
    endDate,
    createdAt,
    listId,
    listName,
    listStatus,
    boardId,
    boardName,
    workspaceId,
  ];
}

class AssistantTasksInsight extends Equatable {
  const AssistantTasksInsight({
    this.overdue = const [],
    this.today = const [],
    this.upcoming = const [],
    this.total = 0,
    this.completedToday = 0,
  });

  factory AssistantTasksInsight.fromJson(
    Map<String, dynamic> json,
  ) => AssistantTasksInsight(
    overdue: _decodeTaskList(json['overdue']),
    today: _decodeTaskList(json['today']),
    upcoming: _decodeTaskList(json['upcoming']),
    total:
        (json['stats'] as Map<String, dynamic>? ?? const {})['total'] as int? ??
        0,
    completedToday:
        (json['stats'] as Map<String, dynamic>? ?? const {})['completed_today']
            as int? ??
        0,
  );

  final List<AssistantTaskInsight> overdue;
  final List<AssistantTaskInsight> today;
  final List<AssistantTaskInsight> upcoming;
  final int total;
  final int completedToday;

  Map<String, dynamic> toJson() => {
    'overdue': overdue.map((task) => task.toJson()).toList(growable: false),
    'today': today.map((task) => task.toJson()).toList(growable: false),
    'upcoming': upcoming.map((task) => task.toJson()).toList(growable: false),
    'stats': {'total': total, 'completed_today': completedToday},
  };

  @override
  List<Object?> get props => [overdue, today, upcoming, total, completedToday];
}

class AssistantCalendarEvent extends Equatable {
  const AssistantCalendarEvent({
    required this.id,
    required this.title,
    this.description,
    this.startAt,
    this.endAt,
    this.color,
    this.location,
  });

  factory AssistantCalendarEvent.fromJson(Map<String, dynamic> json) =>
      AssistantCalendarEvent(
        id: json['id'] as String,
        title: json['title'] as String? ?? 'Untitled event',
        description: json['description'] as String?,
        startAt: _parseDateTime(json['start_at']),
        endAt: _parseDateTime(json['end_at']),
        color: json['color'] as String?,
        location: json['location'] as String?,
      );

  final String id;
  final String title;
  final String? description;
  final DateTime? startAt;
  final DateTime? endAt;
  final String? color;
  final String? location;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'start_at': startAt?.toIso8601String(),
    'end_at': endAt?.toIso8601String(),
    'color': color,
    'location': location,
  };

  @override
  List<Object?> get props => [
    id,
    title,
    description,
    startAt,
    endAt,
    color,
    location,
  ];
}

class AssistantCalendarInsight extends Equatable {
  const AssistantCalendarInsight({
    this.events = const [],
    this.total = 0,
    this.encryptedCount = 0,
  });

  factory AssistantCalendarInsight.fromJson(
    Map<String, dynamic> json,
  ) => AssistantCalendarInsight(
    events: (json['events'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(AssistantCalendarEvent.fromJson)
        .toList(),
    total:
        (json['stats'] as Map<String, dynamic>? ?? const {})['total'] as int? ??
        0,
    encryptedCount:
        (json['stats'] as Map<String, dynamic>? ?? const {})['encrypted_count']
            as int? ??
        0,
  );

  final List<AssistantCalendarEvent> events;
  final int total;
  final int encryptedCount;

  Map<String, dynamic> toJson() => {
    'events': events.map((event) => event.toJson()).toList(growable: false),
    'stats': {'total': total, 'encrypted_count': encryptedCount},
  };

  @override
  List<Object?> get props => [events, total, encryptedCount];
}

class AssistantCredits extends Equatable {
  const AssistantCredits({
    this.totalAllocated = 0,
    this.totalUsed = 0,
    this.remaining = 0,
    this.bonusCredits = 0,
    this.percentUsed = 0,
    this.periodStart,
    this.periodEnd,
    this.tier = 'FREE',
    this.allowedModels = const [],
    this.allowedFeatures = const [],
    this.defaultImageModel,
    this.defaultLanguageModel,
    this.dailyLimit,
    this.dailyUsed = 0,
    this.maxOutputTokens,
    this.balanceScope = 'user',
    this.seatCount,
  });

  factory AssistantCredits.fromJson(Map<String, dynamic> json) =>
      AssistantCredits(
        totalAllocated: _toNum(json['totalAllocated']),
        totalUsed: _toNum(json['totalUsed']),
        remaining: _toNum(json['remaining']),
        bonusCredits: _toNum(json['bonusCredits']),
        percentUsed: _toNum(json['percentUsed']),
        periodStart: _parseDateTime(json['periodStart']),
        periodEnd: _parseDateTime(json['periodEnd']),
        tier: json['tier'] as String? ?? 'FREE',
        allowedModels: (json['allowedModels'] as List<dynamic>? ?? const [])
            .map((model) => model.toString())
            .toList(),
        allowedFeatures: (json['allowedFeatures'] as List<dynamic>? ?? const [])
            .map((feature) => feature.toString())
            .toList(),
        defaultImageModel: json['defaultImageModel'] as String?,
        defaultLanguageModel: json['defaultLanguageModel'] as String?,
        dailyLimit: _toIntOrNull(json['dailyLimit']),
        dailyUsed: _toNum(json['dailyUsed']),
        maxOutputTokens: _toIntOrNull(json['maxOutputTokens']),
        balanceScope: json['balanceScope'] as String? ?? 'user',
        seatCount: _toIntOrNull(json['seatCount']),
      );

  final num totalAllocated;
  final num totalUsed;
  final num remaining;
  final num bonusCredits;
  final num percentUsed;
  final DateTime? periodStart;
  final DateTime? periodEnd;
  final String tier;
  final List<String> allowedModels;
  final List<String> allowedFeatures;
  final String? defaultImageModel;
  final String? defaultLanguageModel;
  final int? dailyLimit;
  final num dailyUsed;
  final int? maxOutputTokens;
  final String balanceScope;
  final int? seatCount;

  Map<String, dynamic> toJson() => {
    'totalAllocated': totalAllocated,
    'totalUsed': totalUsed,
    'remaining': remaining,
    'bonusCredits': bonusCredits,
    'percentUsed': percentUsed,
    'periodStart': periodStart?.toIso8601String(),
    'periodEnd': periodEnd?.toIso8601String(),
    'tier': tier,
    'allowedModels': allowedModels,
    'allowedFeatures': allowedFeatures,
    'defaultImageModel': defaultImageModel,
    'defaultLanguageModel': defaultLanguageModel,
    'dailyLimit': dailyLimit,
    'dailyUsed': dailyUsed,
    'maxOutputTokens': maxOutputTokens,
    'balanceScope': balanceScope,
    'seatCount': seatCount,
  };

  @override
  List<Object?> get props => [
    totalAllocated,
    totalUsed,
    remaining,
    bonusCredits,
    percentUsed,
    periodStart,
    periodEnd,
    tier,
    allowedModels,
    allowedFeatures,
    defaultImageModel,
    defaultLanguageModel,
    dailyLimit,
    dailyUsed,
    maxOutputTokens,
    balanceScope,
    seatCount,
  ];
}

class AssistantGatewayModel extends Equatable {
  const AssistantGatewayModel({
    required this.value,
    required this.label,
    required this.provider,
    this.description,
    this.context,
    this.disabled = false,
    this.tags = const [],
    this.inputPricePerToken,
    this.outputPricePerToken,
    this.maxTokens,
  });

  factory AssistantGatewayModel.fromJson(Map<String, dynamic> json) =>
      AssistantGatewayModel(
        value: json['value'] as String,
        label: json['label'] as String,
        provider: json['provider'] as String? ?? 'google',
        description: json['description'] as String?,
        context: _toIntOrNull(json['context']),
        disabled: json['disabled'] as bool? ?? false,
        tags: (json['tags'] as List<dynamic>? ?? const [])
            .map((tag) => tag.toString())
            .toList(),
        inputPricePerToken: _toDoubleOrNull(json['inputPricePerToken']),
        outputPricePerToken: _toDoubleOrNull(json['outputPricePerToken']),
        maxTokens: _toIntOrNull(json['maxTokens']),
      );

  final String value;
  final String label;
  final String provider;
  final String? description;
  final int? context;
  final bool disabled;
  final List<String> tags;
  final double? inputPricePerToken;
  final double? outputPricePerToken;
  final int? maxTokens;

  bool get supportsFileInput => tags.contains('file-input');

  Map<String, dynamic> toJson() => {
    'value': value,
    'label': label,
    'provider': provider,
    'description': description,
    'context': context,
    'disabled': disabled,
    'tags': tags,
    'inputPricePerToken': inputPricePerToken,
    'outputPricePerToken': outputPricePerToken,
    'maxTokens': maxTokens,
  };

  @override
  List<Object?> get props => [
    value,
    label,
    provider,
    description,
    context,
    disabled,
    tags,
    inputPricePerToken,
    outputPricePerToken,
    maxTokens,
  ];
}

class AssistantAttachment extends Equatable {
  const AssistantAttachment({
    required this.id,
    required this.name,
    required this.size,
    required this.type,
    this.localPath,
    this.previewUrl,
    this.storagePath,
    this.signedUrl,
    this.uploadState = AssistantAttachmentUploadState.pending,
  });

  final String id;
  final String name;
  final int size;
  final String type;
  final String? localPath;
  final String? previewUrl;
  final String? storagePath;
  final String? signedUrl;
  final AssistantAttachmentUploadState uploadState;

  bool get isImage => type.startsWith('image/');
  bool get isUploaded =>
      uploadState == AssistantAttachmentUploadState.uploaded &&
      storagePath != null;

  AssistantAttachment copyWith({
    String? id,
    String? name,
    int? size,
    String? type,
    String? localPath,
    String? previewUrl,
    String? storagePath,
    String? signedUrl,
    AssistantAttachmentUploadState? uploadState,
  }) {
    return AssistantAttachment(
      id: id ?? this.id,
      name: name ?? this.name,
      size: size ?? this.size,
      type: type ?? this.type,
      localPath: localPath ?? this.localPath,
      previewUrl: previewUrl ?? this.previewUrl,
      storagePath: storagePath ?? this.storagePath,
      signedUrl: signedUrl ?? this.signedUrl,
      uploadState: uploadState ?? this.uploadState,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'size': size,
    'type': type,
    'localPath': localPath,
    'previewUrl': previewUrl,
    'storagePath': storagePath,
    'signedUrl': signedUrl,
    'uploadState': uploadState.name,
  };

  factory AssistantAttachment.fromJson(Map<String, dynamic> json) =>
      AssistantAttachment(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Attachment',
        size: _toIntOrNull(json['size']) ?? 0,
        type: json['type'] as String? ?? 'application/octet-stream',
        localPath: json['localPath'] as String?,
        previewUrl: json['previewUrl'] as String?,
        storagePath: json['storagePath'] as String?,
        signedUrl: json['signedUrl'] as String?,
        uploadState: AssistantAttachmentUploadState.values.firstWhere(
          (state) => state.name == json['uploadState'],
          orElse: () => AssistantAttachmentUploadState.pending,
        ),
      );

  factory AssistantAttachment.fromStoredFile(Map<String, dynamic> json) =>
      AssistantAttachment(
        id: 'stored-${json['path'] ?? jsonEncode(json)}',
        name: json['name'] as String? ?? 'Attachment',
        size: _toIntOrNull(json['size']) ?? 0,
        type: json['type'] as String? ?? 'application/octet-stream',
        storagePath: json['path'] as String?,
        signedUrl: json['signedUrl'] as String?,
        uploadState: AssistantAttachmentUploadState.uploaded,
      );

  @override
  List<Object?> get props => [
    id,
    name,
    size,
    type,
    localPath,
    previewUrl,
    storagePath,
    signedUrl,
    uploadState,
  ];
}

enum AssistantAttachmentUploadState { pending, uploading, uploaded, error }

class AssistantChatRecord extends Equatable {
  const AssistantChatRecord({
    required this.id,
    this.title,
    this.model,
    this.isPublic = false,
    this.createdAt,
  });

  factory AssistantChatRecord.fromJson(Map<String, dynamic> json) =>
      AssistantChatRecord(
        id: json['id'] as String,
        title: json['title'] as String?,
        model: json['model'] as String?,
        isPublic: json['is_public'] as bool? ?? false,
        createdAt: _parseDateTime(json['created_at']),
      );

  final String id;
  final String? title;
  final String? model;
  final bool isPublic;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'model': model,
    'is_public': isPublic,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [id, title, model, isPublic, createdAt];
}

class AssistantRestoredChat extends Equatable {
  const AssistantRestoredChat({
    required this.chat,
    required this.messages,
    required this.attachmentsByMessageId,
  });

  factory AssistantRestoredChat.fromJson(Map<String, dynamic> json) {
    final chatRaw = json['chat'];
    return AssistantRestoredChat(
      chat: chatRaw is Map<String, dynamic>
          ? AssistantChatRecord.fromJson(chatRaw)
          : null,
      messages: (json['messages'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(AssistantMessage.fromJson)
          .toList(),
      attachmentsByMessageId: _assistantAttachmentsByMessageIdFromJson(
        json['attachmentsByMessageId'],
      ),
    );
  }

  final AssistantChatRecord? chat;
  final List<AssistantMessage> messages;
  final Map<String, List<AssistantAttachment>> attachmentsByMessageId;

  Map<String, dynamic> toJson() => {
    'chat': chat?.toJson(),
    'messages': messages.map((m) => m.toJson()).toList(),
    'attachmentsByMessageId': {
      for (final e in attachmentsByMessageId.entries)
        e.key: e.value.map((a) => a.toJson()).toList(),
    },
  };

  @override
  List<Object?> get props => [chat, messages, attachmentsByMessageId];
}

Map<String, List<AssistantAttachment>> _assistantAttachmentsByMessageIdFromJson(
  Object? raw,
) {
  if (raw is! Map) {
    return const {};
  }
  final decoded = Map<String, dynamic>.from(raw);
  final out = <String, List<AssistantAttachment>>{};
  for (final entry in decoded.entries) {
    final list = entry.value;
    if (list is! List) {
      continue;
    }
    out[entry.key] = list
        .whereType<Map<String, dynamic>>()
        .map(AssistantAttachment.fromJson)
        .toList();
  }
  return out;
}

class AssistantMessage extends Equatable {
  const AssistantMessage({
    required this.id,
    required this.role,
    this.parts = const [],
    this.createdAt,
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
      );

  final String id;
  final String role;
  final List<AssistantMessagePart> parts;
  final DateTime? createdAt;

  AssistantMessage copyWith({
    String? id,
    String? role,
    List<AssistantMessagePart>? parts,
    DateTime? createdAt,
  }) {
    return AssistantMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      parts: parts ?? this.parts,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'parts': parts.map((part) => part.toJson()).toList(),
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [id, role, parts, createdAt];
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

class AssistantQueuedSubmission extends Equatable {
  const AssistantQueuedSubmission({
    required this.message,
    required this.attachments,
  });

  final String message;
  final List<AssistantAttachment> attachments;

  @override
  List<Object?> get props => [message, attachments];
}

class AssistantFilePickerResult extends Equatable {
  const AssistantFilePickerResult({
    required this.id,
    required this.file,
    required this.name,
    required this.size,
    required this.path,
    required this.mimeType,
  });

  factory AssistantFilePickerResult.fromPlatformFile(
    PlatformFile file,
    String id,
  ) {
    final extension = file.extension?.toLowerCase() ?? '';
    final mimeType = _mimeTypeFromExtension(extension);
    return AssistantFilePickerResult(
      id: id,
      file: file,
      name: file.name,
      size: file.size,
      path: file.path ?? '',
      mimeType: mimeType,
    );
  }

  final String id;
  final PlatformFile file;
  final String name;
  final int size;
  final String path;
  final String mimeType;

  @override
  List<Object?> get props => [id, name, size, path, mimeType];
}

DateTime? _parseDateTime(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

num _toNum(dynamic value) {
  if (value is num) return value;
  return num.tryParse(value?.toString() ?? '') ?? 0;
}

int? _toIntOrNull(dynamic value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '');
}

double? _toDoubleOrNull(dynamic value) {
  if (value is double) return value;
  if (value is int) return value.toDouble();
  return double.tryParse(value?.toString() ?? '');
}

List<AssistantTaskInsight> _decodeTaskList(dynamic raw) {
  return (raw as List<dynamic>? ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(AssistantTaskInsight.fromJson)
      .toList();
}

String _mimeTypeFromExtension(String extension) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'md':
      return 'text/markdown';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'application/octet-stream';
  }
}
