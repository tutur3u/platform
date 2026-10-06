import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantToolSummary extends StatelessWidget {
  const AssistantToolSummary({
    required this.parts,
    required this.tileBuilder,
    super.key,
  });

  final List<AssistantMessagePart> parts;
  final Widget Function(AssistantMessagePart) tileBuilder;

  @override
  Widget build(BuildContext context) {
    final visible = parts;
    if (visible.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final actionCount = visible
        .where((part) => part.toolName != 'search_tools')
        .length;
    final displayCount = actionCount == 0 ? visible.length : actionCount;
    final label = displayCount == 1
        ? context.l10n.assistantToolLabel
        : context.l10n.assistantToolsLabel;
    final sheetLabel = visible.length == 1
        ? context.l10n.assistantToolLabel
        : context.l10n.assistantToolsLabel;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (sheetContext) => SafeArea(
            child: FractionallySizedBox(
              heightFactor: 0.72,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                    child: Text(
                      '$sheetLabel · ${visible.length}',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  Expanded(
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: visible.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, index) => tileBuilder(visible[index]),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
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
              Text(
                '$label · $displayCount',
                style: theme.textTheme.labelMedium,
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right_rounded, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}
