part of 'task_board_detail_page.dart';

class _TaskBoardDescriptionAccordion extends StatelessWidget {
  const _TaskBoardDescriptionAccordion({
    required this.label,
    required this.description,
    required this.isExpanded,
    required this.onToggle,
    this.canCollapse = true,
  });

  final String label;
  final ParsedTipTapDescription description;
  final bool isExpanded;
  final VoidCallback onToggle;
  final bool canCollapse;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: canCollapse ? onToggle : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (canCollapse)
                      Icon(
                        isExpanded ? Icons.expand_less : Icons.expand_more,
                        size: 18,
                        color: theme.colorScheme.mutedForeground,
                      ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            child: isExpanded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildDescriptionViewer(context),
                        const shad.Gap(8),
                        if (canCollapse)
                          Align(
                            alignment: Alignment.centerRight,
                            child: Tooltip(
                              message: label,
                              child: shad.IconButton.ghost(
                                onPressed: onToggle,
                                icon: Icon(
                                  Icons.expand_less,
                                  size: 16,
                                  color: theme.colorScheme.mutedForeground,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildDescriptionViewer(BuildContext context) {
    return _TaskBoardDescriptionDocument(description: description);
  }
}

class _TaskBoardDescriptionDocument extends StatelessWidget {
  const _TaskBoardDescriptionDocument({
    required this.description,
  });

  final ParsedTipTapDescription description;

  @override
  Widget build(BuildContext context) {
    final normalizedRawJson = description.rawJson?.trim();
    final descriptionPayload =
        (normalizedRawJson != null && normalizedRawJson.isNotEmpty)
        ? normalizedRawJson
        : description.markdown;

    return TaskDescriptionViewer(
      descriptionJson: descriptionPayload,
    );
  }
}
