import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_thinking_accordion.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';

/// Text and images retain source ordering. Only adjacent tools share a group.
List<Widget> assistantOrderedPartWidgets(
  List<AssistantMessagePart> parts, {
  required bool active,
}) {
  final children = <Widget>[];
  final reasoning = parts
      .where(
        (part) =>
            part.type == 'reasoning' && (part.text?.trim().isNotEmpty ?? false),
      )
      .toList(growable: false);
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
      final start = index;
      if (assistantImageToolParts([part]).isNotEmpty) {
        children.add(
          Padding(
            key: ValueKey('assistant-tool-part-$start'),
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: AssistantInlineToolImages(parts: [part]),
          ),
        );
      } else {
        final tools = <AssistantMessagePart>[part];
        while (index + 1 < parts.length &&
            parts[index + 1].type == 'dynamic-tool' &&
            assistantImageToolParts([parts[index + 1]]).isEmpty) {
          tools.add(parts[++index]);
        }
        children.add(
          Padding(
            key: ValueKey('assistant-tool-part-$start'),
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: AssistantToolResultsSection(parts: tools),
          ),
        );
      }
    } else if (part.type == 'text' && (part.text?.trim().isNotEmpty ?? false)) {
      children.add(
        Padding(
          key: ValueKey('assistant-text-part-$index'),
          padding: const EdgeInsets.only(bottom: 8),
          child: AssistantMarkdownBody(data: part.text!.trim()),
        ),
      );
    }
  }
  return children;
}
