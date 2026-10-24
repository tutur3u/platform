import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantToolNames extends StatefulWidget {
  const AssistantToolNames({required this.toolNames, super.key});

  final List<String> toolNames;

  @override
  State<AssistantToolNames> createState() => _AssistantToolNamesState();
}

class _AssistantToolNamesState extends State<AssistantToolNames> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final names = widget.toolNames;
    if (names.length == 1) {
      return _AssistantToolNameChip(label: names.single);
    }

    if (!_expanded) {
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _AssistantToolNameChip(label: names.last),
          TextButton(
            onPressed: () => setState(() => _expanded = true),
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
            child: Text(l10n.assistantSeeMoreLabel),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: names
              .map((tool) => _AssistantToolNameChip(label: tool))
              .toList(growable: false),
        ),
        TextButton(
          onPressed: () => setState(() => _expanded = false),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.only(top: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            visualDensity: VisualDensity.compact,
          ),
          child: Text(l10n.assistantSeeLessLabel),
        ),
      ],
    );
  }
}

class _AssistantToolNameChip extends StatelessWidget {
  const _AssistantToolNameChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.66),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: theme.textTheme.labelSmall),
    );
  }
}
