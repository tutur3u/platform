import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Formats only reasoning text already present in visible API message parts.
class AssistantThinkingAccordion extends StatefulWidget {
  const AssistantThinkingAccordion({
    required this.parts,
    required this.active,
    super.key,
  });

  final List<AssistantMessagePart> parts;
  final bool active;

  @override
  State<AssistantThinkingAccordion> createState() =>
      _AssistantThinkingAccordionState();
}

class _AssistantThinkingAccordionState
    extends State<AssistantThinkingAccordion> {
  bool _expanded = false;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final headings = RegExp(
      r'^\s{0,3}(?:#{1,6}\s+(.+?)(?:\s+#+)?|\*\*(.+?)\*\*)\s*$',
      multiLine: true,
    );
    String? latestHeading;
    for (final part in widget.parts) {
      for (final match in headings.allMatches(part.text ?? '')) {
        latestHeading = (match.group(1) ?? match.group(2))
            ?.replaceAll(RegExp('[*_`]'), '')
            .trim();
      }
    }
    final label = latestHeading?.isNotEmpty ?? false
        ? latestHeading!
        : widget.active
        ? context.l10n.assistantThinkingStatus
        : context.l10n.assistantReasoningLabel;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          button: true,
          excludeSemantics: true,
          onTap: _toggle,
          expanded: _expanded,
          label: '${context.l10n.assistantReasoningLabel}: $label',
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('assistant-thinking-toggle'),
              borderRadius: BorderRadius.circular(8),
              onTap: _toggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.active)
                      const NovaLoadingIndicator(
                        key: ValueKey('assistant-thinking-active-icon'),
                        size: 16,
                      )
                    else
                      Icon(
                        Icons.psychology_outlined,
                        size: 16,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      _expanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      size: 16,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        AnimatedSize(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 180),
          alignment: Alignment.topLeft,
          child: !_expanded
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(left: 4, top: 4, bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final part in widget.parts)
                        AssistantMarkdownBody(
                          data: part.text!.trim(),
                          subdued: true,
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}
