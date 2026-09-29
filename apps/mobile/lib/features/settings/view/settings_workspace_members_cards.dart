part of 'settings_workspace_members_page.dart';

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member, this.onRemove});

  final WorkspaceMemberListItem member;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final roleText = member.roles.map((role) => role.name).join(', ');
    return FinancePanel(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        member.label,
                        style: shad.Theme.of(context).typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (member.isCreator)
                      _StatusChip(
                        label: context.l10n.settingsWorkspaceMembersCreatorChip,
                      ),
                    if (member.pending)
                      _StatusChip(
                        label: context.l10n.settingsWorkspaceMembersPendingChip,
                      ),
                  ],
                ),
                if (member.email != null && member.email != member.label) ...[
                  const shad.Gap(4),
                  Text(
                    member.email!,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
                if (roleText.isNotEmpty) ...[
                  const shad.Gap(8),
                  Text(
                    roleText,
                    style: shad.Theme.of(context).typography.xSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onRemove != null) ...[
            const shad.Gap(12),
            shad.GhostButton(
              density: shad.ButtonDensity.compact,
              onPressed: onRemove,
              child: const Icon(Icons.delete_outline_rounded),
            ),
          ],
        ],
      ),
    );
  }
}

class _InviteLinkCard extends StatelessWidget {
  const _InviteLinkCard({
    required this.link,
    required this.onCopy,
    required this.onRemove,
  });

  final WorkspaceInviteLink link;
  final VoidCallback onCopy;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final expiresAt = link.expiresAt == null
        ? l10n.settingsWorkspaceMembersLinkNever
        : DateFormat.yMMMd().add_Hm().format(
            DateTime.parse(link.expiresAt!).toLocal(),
          );
    final uses = link.maxUses == null
        ? '${link.currentUses}'
        : '${link.currentUses}/${link.maxUses}';
    final status = link.isExpired
        ? l10n.settingsWorkspaceMembersLinkExpired
        : link.isFull
        ? l10n.settingsWorkspaceMembersLinkFull
        : l10n.settingsWorkspaceMembersLinkActive;

    return FinancePanel(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  link.code,
                  style: shad.Theme.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              _StatusChip(label: status),
            ],
          ),
          const shad.Gap(8),
          Text(
            '$uses · $expiresAt',
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          Row(
            children: [
              shad.OutlineButton(
                density: shad.ButtonDensity.compact,
                onPressed: onCopy,
                child: Text(l10n.settingsWorkspaceMembersLinkCopy),
              ),
              const shad.Gap(8),
              shad.GhostButton(
                density: shad.ButtonDensity.compact,
                onPressed: onRemove,
                child: const Icon(Icons.delete_outline_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MembersTextField extends StatelessWidget {
  const _MembersTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.keyboardType,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final TextInputType? keyboardType;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          keyboardType: keyboardType,
          placeholder: Text(placeholder),
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(6),
          Text(
            errorText!,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.destructive,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: FinancePalette.of(context).accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: shad.Theme.of(context).typography.xSmall.copyWith(
          color: FinancePalette.of(context).accent,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _MembersStatePanel extends StatelessWidget {
  const _MembersStatePanel({
    required this.message,
    this.actionLabel,
    this.onPressed,
  });

  final String message;
  final String? actionLabel;
  final Future<void> Function()? onPressed;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          if (actionLabel != null && onPressed != null) ...[
            const shad.Gap(14),
            shad.OutlineButton(
              onPressed: () => unawaited(onPressed!.call()),
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
