part of 'crm_page.dart';

class _CrmUserCard extends StatelessWidget {
  const _CrmUserCard({
    required this.user,
    this.onOpen,
    this.onEdit,
    this.onDelete,
    this.onFeedback,
  });

  final CrmUser user;
  final VoidCallback? onOpen;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onFeedback;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = user.requireAttention
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final secondaryLine = [
      user.email,
      user.phone,
      if (user.address?.trim().isNotEmpty ?? false) user.address,
    ].whereType<String>().where((value) => value.isNotEmpty).join(' • ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              NetworkAvatar(
                radius: 20,
                backgroundColor: accent.withValues(alpha: 0.12),
                avatarUrl: user.avatarUrl,
                child: Text(
                  user.label.isEmpty
                      ? '?'
                      : user.label.characters.first.toUpperCase(),
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            user.label,
                            style: theme.typography.base.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (onEdit != null ||
                            onDelete != null ||
                            onFeedback != null)
                          PopupMenuButton<String>(
                            onSelected: (value) {
                              if (value == 'edit') onEdit?.call();
                              if (value == 'delete') onDelete?.call();
                              if (value == 'feedback') onFeedback?.call();
                            },
                            itemBuilder: (context) => [
                              if (onEdit != null)
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text(context.l10n.commonEdit),
                                ),
                              if (onFeedback != null)
                                PopupMenuItem(
                                  value: 'feedback',
                                  child: Text(context.l10n.crmFeedbackAction),
                                ),
                              if (onDelete != null)
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text(context.l10n.commonDelete),
                                ),
                            ],
                          ),
                      ],
                    ),
                    if (secondaryLine.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        secondaryLine,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                    // State pills only; bare group and promotion counts
                    // drive nothing, so the card does not show them.
                    if (user.requireAttention ||
                        user.archived ||
                        user.isGuest) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (user.requireAttention)
                            _CrmPill(
                              icon: Icons.priority_high_rounded,
                              label: context.l10n.crmRequireAttention,
                              tint: theme.colorScheme.destructive,
                            ),
                          if (user.archived)
                            _CrmPill(
                              icon: Icons.archive_outlined,
                              label: context.l10n.crmArchived,
                              tint: theme.colorScheme.mutedForeground,
                            ),
                          if (user.isGuest)
                            _CrmPill(
                              icon: Icons.person_outline_rounded,
                              label: context.l10n.crmGuestUser,
                              tint: accent,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
