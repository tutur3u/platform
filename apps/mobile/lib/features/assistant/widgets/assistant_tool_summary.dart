import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// One collapsed ghost accordion for each consecutive run of tool calls.
class AssistantToolSummary extends StatefulWidget {
  const AssistantToolSummary({
    required this.parts,
    required this.tileBuilder,
    super.key,
  });

  final List<AssistantMessagePart> parts;
  final Widget Function(AssistantMessagePart) tileBuilder;

  @override
  State<AssistantToolSummary> createState() => _AssistantToolSummaryState();
}

class _AssistantToolSummaryState extends State<AssistantToolSummary> {
  bool _expanded = false;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    final parts = widget.parts;
    if (parts.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final latest = parts.last.toolName ?? context.l10n.assistantToolLabel;
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
          label:
              '${context.l10n.assistantToolsLabel}: $latest · ${parts.length}',
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const ValueKey('assistant-tools-toggle'),
              borderRadius: BorderRadius.circular(8),
              onTap: _toggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.handyman_outlined,
                      size: 16,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        '$latest · ${parts.length}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelMedium,
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
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final part in parts) widget.tileBuilder(part),
                  ],
                ),
        ),
      ],
    );
  }
}
