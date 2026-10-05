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
    final fields = <(IconData, String, String?)>[
      if (publicInfo)
        (Icons.person_outline, l10n.crmDisplayName, user.displayName),
      if (privateInfo) ...[
        (Icons.email_outlined, l10n.emailLabel, user.email),
        (Icons.phone_outlined, l10n.crmPhone, user.phone),
        (Icons.place_outlined, l10n.crmAddress, user.address),
        (Icons.cake_outlined, l10n.crmBirthday, user.birthday),
        (Icons.notes_rounded, l10n.crmNote, user.note),
      ],
    ].where((field) => field.$3?.trim().isNotEmpty ?? false).toList();
    return ListView(
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        24 + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        Center(
          child: NetworkAvatar(
            radius: 40,
            avatarUrl: user.avatarUrl,
            child: Text(user.label.characters.firstOrNull ?? '?'),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          user.label,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 24),
        for (final field in fields)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(field.$1),
            title: Text(field.$2),
            subtitle: SelectableText(field.$3!),
          ),
      ],
    );
  }
}
