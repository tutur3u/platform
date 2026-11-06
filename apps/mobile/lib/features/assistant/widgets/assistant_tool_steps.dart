import 'package:mobile/features/assistant/models/assistant_models.dart';

/// Discovery and no-op tools from `packages/ai` (`mira-tool-discovery.ts`).
/// They plan the turn but perform no user-visible work, so they never count
/// as steps and never render on their own.
const assistantMetaToolNames = {
  'search_tools',
  'select_tools',
  'no_action_needed',
};

bool isAssistantMetaTool(String? toolName) =>
    toolName != null && assistantMetaToolNames.contains(toolName);

/// AI SDK states before a tool call produces its output.
bool isAssistantToolPartPending(AssistantMessagePart part) =>
    part.state == 'input-streaming' || part.state == 'input-available';

bool isAssistantToolPartFailed(AssistantMessagePart part) =>
    part.state == 'output-error' || part.state == 'output-denied';

/// Generated images render inline in source order instead of in the group.
bool isAssistantInlineImageToolPart(AssistantMessagePart part) =>
    part.type == 'dynamic-tool' &&
    part.toolName == 'create_image' &&
    assistantToolImageFields(part.output) != null;

/// Tool calls that count as a step in the turn's tool accordion.
List<AssistantMessagePart> assistantVisibleToolSteps(
  Iterable<AssistantMessagePart> parts,
) => [
  for (final part in parts)
    if (part.type == 'dynamic-tool' &&
        !isAssistantMetaTool(part.toolName) &&
        !isAssistantInlineImageToolPart(part))
      part,
];

/// A step only spins while its message is still streaming; an interrupted
/// stream leaves pending states behind that must read as settled.
bool assistantToolStepsRunning(
  List<AssistantMessagePart> steps, {
  required bool active,
}) => active && steps.any(isAssistantToolPartPending);

/// The `imageUrl`/`storagePath` pair of a `create_image` output, if any.
({String? imageUrl, String? storagePath, String? prompt})?
assistantToolImageFields(dynamic output) {
  if (output is! Map) return null;
  final imageUrl = output['imageUrl']?.toString().trim();
  final storagePath = output['storagePath']?.toString().trim();
  if ((imageUrl == null || imageUrl.isEmpty) &&
      (storagePath == null || storagePath.isEmpty)) {
    return null;
  }
  return (
    imageUrl: imageUrl,
    storagePath: storagePath,
    prompt: output['prompt']?.toString(),
  );
}
