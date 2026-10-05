import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Canonical chat wraps the original AI metadata in its identity envelope.
/// Legacy AI history stores the same metadata directly.
List<AssistantMessagePart> restoreAssistantHistoryParts(
  String? content,
  Map<String, dynamic>? metadata,
) {
  final historyMetadata =
      metadata?['source'] == 'ai-chat' &&
          metadata?['metadata'] is Map<String, dynamic>
      ? metadata!['metadata'] as Map<String, dynamic>
      : metadata;
  final ordered = historyMetadata?['parts'];
  if (ordered is List && ordered.isNotEmpty) {
    final parsed = <AssistantMessagePart>[];
    for (final raw in ordered) {
      if (raw is! Map<String, dynamic> || raw['type'] is! String) {
        parsed.clear();
        break;
      }
      final map = Map<String, dynamic>.from(raw);
      const stringFields = [
        'text',
        'toolName',
        'toolCallId',
        'state',
        'sourceId',
        'url',
        'title',
        'blockId',
      ];
      if (stringFields.any((key) => map[key] != null && map[key] is! String) ||
          (map['metadata'] != null &&
              map['metadata'] is! Map<String, dynamic>)) {
        parsed.clear();
        break;
      }
      parsed.add(AssistantMessagePart.fromJson(map));
    }
    if (parsed.isNotEmpty) return parsed;
  }
  final reasoning = historyMetadata?['reasoning'];
  final parts = <AssistantMessagePart>[
    if (reasoning is String && reasoning.isNotEmpty)
      AssistantMessagePart(type: 'reasoning', text: reasoning),
    if (content != null && content.isNotEmpty)
      AssistantMessagePart(type: 'text', text: content),
  ];
  final calls = historyMetadata?['toolCalls'];
  final results = historyMetadata?['toolResults'];
  for (final call in calls is List ? calls : const <dynamic>[]) {
    if (call is! Map) continue;
    final id = call['toolCallId'] ?? call['id'];
    Map<dynamic, dynamic>? result;
    for (final entry in results is List ? results : const <dynamic>[]) {
      if (entry is Map && (entry['toolCallId'] ?? entry['id']) == id) {
        result = entry;
        break;
      }
    }
    final name = call['toolName'] ?? call['name'];
    parts.add(
      AssistantMessagePart(
        type: 'dynamic-tool',
        toolName: name is String ? name : null,
        toolCallId: id is String ? id : null,
        state: result == null ? 'input-available' : 'output-available',
        input: call['input'] ?? call['args'] ?? const <String, dynamic>{},
        output: result?['output'] ?? result?['result'],
      ),
    );
  }
  final sources = historyMetadata?['sources'];
  for (final source in sources is List ? sources : const <dynamic>[]) {
    if (source is! Map) continue;
    String? value(String key) =>
        source[key] is String ? source[key] as String : null;
    parts.add(
      AssistantMessagePart(
        type: 'source-url',
        sourceId: value('sourceId'),
        url: value('url'),
        title: value('title'),
      ),
    );
  }
  return parts;
}
