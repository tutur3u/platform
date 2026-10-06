part of 'settings_workspace_roles_page.dart';

class _RoleSummaryCard extends StatelessWidget {
  const _RoleSummaryCard({
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: shad.Theme.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w800),
                ),
                if (subtitle?.trim().isNotEmpty ?? false) ...[
                  const shad.Gap(4),
                  Text(
                    subtitle!,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          trailing ??
              Icon(
                Icons.chevron_right_rounded,
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
        ],
      ),
    );
  }
}

class _PermissionGroupCard extends StatelessWidget {
  const _PermissionGroupCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 20,
      padding: const EdgeInsets.all(14),
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(
              context,
            ).typography.textSmall.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(10),
          ...children,
        ],
      ),
    );
  }
}

class _PermissionToggleRow extends StatelessWidget {
  const _PermissionToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 16,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: shad.Theme.of(
                context,
              ).typography.textSmall.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          const shad.Gap(12),
          shad.Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _MemberAssignmentRow extends StatelessWidget {
  const _MemberAssignmentRow({
    required this.member,
    required this.selected,
    required this.onChanged,
  });

  final WorkspaceMemberListItem member;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      radius: 16,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.label,
                  style: shad.Theme.of(
                    context,
                  ).typography.textSmall.copyWith(fontWeight: FontWeight.w700),
                ),
                if (member.email != null && member.email != member.label) ...[
                  const shad.Gap(4),
                  Text(
                    member.email!,
                    style: shad.Theme.of(context).typography.xSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          shad.Switch(value: selected, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _FinanceStyleTextField extends StatelessWidget {
  const _FinanceStyleTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
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

class _SettingsStatePanel extends StatelessWidget {
  const _SettingsStatePanel({
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
