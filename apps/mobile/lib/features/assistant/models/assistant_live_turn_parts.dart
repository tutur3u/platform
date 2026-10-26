import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Live tools whose results describe the user's screen and must never be
/// stored with the conversation.
const assistantEphemeralLiveTools = {'get_mobile_screen_context'};

/// Each turn owns its tool objects while asynchronous execution completes.
/// Text and transcription are alternate provider streams, never duplicates.
class AssistantLiveTurnParts {
  final List<Map<String, dynamic>> _text = [];
  final List<Map<String, dynamic>> _transcript = [];
  final List<Map<String, dynamic>> _tools = [];
  bool _hasText = false;

  void appendText(String before, String after, {bool transcript = false}) {
    if (after == before) return;
    final delta = after.startsWith(before)
        ? after.substring(before.length)
        : after;
    if (delta.isEmpty) return;
    if (!transcript) _hasText = true;
    final target = transcript ? _transcript : _text;
    if (target.isNotEmpty && target.last['type'] == 'text') {
      target.last['text'] = '${target.last['text']}$delta';
    } else {
      target.add({'type': 'text', 'text': delta});
    }
  }

  Map<String, dynamic> beginTool({
    required String id,
    required String name,
    required Map<String, dynamic> args,
  }) {
    final part = <String, dynamic>{
      'type': 'dynamic-tool',
      'toolCallId': id,
      'toolName': name,
      'input': Map<String, dynamic>.from(args),
      'state': 'input-available',
    };
    _text.add(part);
    _transcript.add(part);
    _tools.add(part);
    return part;
  }

  /// Ephemeral tool results (screen context) reach the model over the socket
  /// only; parts, persisted history and restored caches keep a placeholder.
  void completeTool(Map<String, dynamic> part, Map<String, dynamic> result) {
    part['output'] = assistantEphemeralLiveTools.contains(part['toolName'])
        ? const {'shared': true, 'retained': false}
        : Map<String, dynamic>.from(result);
    part['state'] = 'output-available';
  }

  List<Map<String, dynamic>> toJson() => (_hasText ? _text : _transcript)
      .map(Map<String, dynamic>.from)
      .toList(growable: false);

  List<AssistantMessagePart> get parts =>
      toJson().map(AssistantMessagePart.fromJson).toList(growable: false);

  List<Map<String, dynamic>> get toolCalls => _tools
      .map(
        (p) => {
          'toolCallId': p['toolCallId'],
          'toolName': p['toolName'],
          'args': p['input'],
        },
      )
      .toList(growable: false);

  List<Map<String, dynamic>> get toolResults => _tools
      .where((p) => p.containsKey('output'))
      .map(
        (p) => {
          'toolCallId': p['toolCallId'],
          'toolName': p['toolName'],
          'result': p['output'],
        },
      )
      .toList(growable: false);
}
