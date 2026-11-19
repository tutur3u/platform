part of 'crm_page.dart';

/// Details are drawn exclusively from permission-redacted database list rows.
class _CrmUserDetail extends StatelessWidget {
  const _CrmUserDetail({
    required this.user,
    required this.privateInfo,
    required this.publicInfo,
  });

  final CrmUser user;
  final bool privateInfo;
  final bool publicInfo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final name =
        contactNamedTitle(
          displayName: user.displayName,
          fullName: user.fullName,
        ) ??
        l10n.contactsTitle;
    final display = _present(user.displayName);
    final collapsedDisplay = display == null
        ? null
        : collapseContactName(display);
    final fields = <(String, String, bool)>[
      if (publicInfo && collapsedDisplay != null && collapsedDisplay != name)
        (l10n.crmDisplayName, collapsedDisplay, false),
      if (privateInfo) ...[
        if (_present(user.email) != null)
          (l10n.emailLabel, user.email!.trim(), true),
        if (_present(user.phone) != null)
          (l10n.crmPhone, user.phone!.trim(), true),
        if (_present(user.address) != null)
          (l10n.crmAddress, user.address!.trim(), true),
        if (_present(user.birthday) != null)
          (l10n.crmBirthday, user.birthday!.trim(), true),
        if (_present(user.note) != null)
          (l10n.crmNote, user.note!.trim(), true),
      ],
    ];
    return AppPageListView(
      children: [
        Center(
          child: NetworkAvatar(
            radius: 28,
            backgroundColor: AppTone.info.fill(tokens.colorScheme),
            avatarUrl: publicInfo ? user.avatarUrl : null,
            child: Text(
              contactInitials(name),
              style: tokens.typography.large.copyWith(
                color: AppTone.info.foreground(tokens.colorScheme),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          name,
          textAlign: TextAlign.center,
          style: tokens.typography.large.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppLayout.sectionGap),
        if (fields.isNotEmpty)
          AppPanel(
            title: l10n.contactsDetails,
            child: Column(
              children: [
                for (final field in fields)
                  if (field.$3)
                    _SelectableValue(label: field.$1, value: field.$2)
                  else
                    AppKeyValueRow(label: field.$1, value: field.$2),
              ],
            ),
          ),
      ],
    );
  }
}

String? _present(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  return trimmed;
}

class _SelectableValue extends StatelessWidget {
  const _SelectableValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            flex: 2,
            child: SelectableText(
              value,
              textAlign: TextAlign.end,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
