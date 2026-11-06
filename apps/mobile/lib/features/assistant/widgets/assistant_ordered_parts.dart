import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_source_link.dart';
import 'package:mobile/features/assistant/widgets/assistant_thinking_accordion.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_steps.dart';

/// Text and images retain source ordering. Every other tool call in the turn
/// joins one accordion placed where the first tool call appears.
List<Widget> assistantOrderedPartWidgets(
  List<AssistantMessagePart> parts, {
  required bool active,
}) {
  final children = <Widget>[];
  final reasoning = <AssistantMessagePart>[];
  final tools = <AssistantMessagePart>[];
  var firstTool = -1;
  var lastText = -1;
  for (var index = 0; index < parts.length; index++) {
    final part = parts[index];
    if (part.type == 'reasoning' && (part.text?.trim().isNotEmpty ?? false)) {
      reasoning.add(part);
    } else if (part.type == 'dynamic-tool' &&
        !isAssistantInlineImageToolPart(part)) {
      if (firstTool < 0) firstTool = index;
      tools.add(part);
    } else if (part.type == 'text' && (part.text?.trim().isNotEmpty ?? false)) {
      lastText = index;
    }
  }
  final hasSteps = assistantVisibleToolSteps(tools).isNotEmpty;
  // Meta-only turns render nothing once the reply text has started.
  final showTools = hasSteps || (active && lastText < firstTool);
  var showedReasoning = false;
  for (var index = 0; index < parts.length; index++) {
    final part = parts[index];
    if (part.type == 'reasoning') {
      if (!showedReasoning && reasoning.isNotEmpty) {
        showedReasoning = true;
        children.add(
          AssistantThinkingAccordion(
            key: const ValueKey('assistant-turn-thinking'),
            parts: reasoning,
            active: active,
          ),
        );
      }
    } else if (part.type == 'dynamic-tool') {
      if (isAssistantInlineImageToolPart(part)) {
        children.add(
          Padding(
            key: ValueKey('assistant-tool-part-$index'),
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: AssistantInlineToolImages(parts: [part]),
          ),
        );
      } else if (index == firstTool && showTools) {
        children.add(
          Padding(
            key: ValueKey('assistant-tool-part-$index'),
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: AssistantToolResultsSection(parts: tools, active: active),
          ),
        );
      }
    } else if (part.type == 'source-url' && part.url != null) {
      children.add(AssistantSourceLink(url: part.url!, title: part.title));
    } else if (part.type == 'text' && (part.text?.trim().isNotEmpty ?? false)) {
      children.add(
        Padding(
          key: ValueKey('assistant-text-part-$index'),
          padding: const EdgeInsets.only(bottom: 8),
          child: AssistantMarkdownBody(
            data: part.text!.trim(),
            selectable: false,
          ),
        ),
      );
    }
  }
  return children;
}
