import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// One contact in the directory: avatar or initials, one name, one secondary
/// line. A phone number never shares a wrapping line with the email.
class ContactListRow extends StatelessWidget {
  const ContactListRow({
    required this.user,
    this.onTap,
    this.onLongPress,
    this.selected = false,
    super.key,
  });

  final CrmUser user;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final name = contactPrimaryNameFor(user);
    final secondary = contactSecondaryLine(
      displayName: user.displayName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
    );
    final phone = contactPhoneLine(
      displayName: user.displayName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
    );
    final tone = user.requireAttention ? AppTone.warning : AppTone.info;
    return AppRichRow(
      title: name,
      semanticLabel: name,
      selected: selected,
      onTap: onTap,
      onLongPress: onLongPress,
      leading: NetworkAvatar(
        radius: 20,
        backgroundColor: tone.fill(tokens.colorScheme),
        avatarUrl: user.avatarUrl,
        child: Text(
          contactInitials(name),
          style: tokens.typography.xSmall.copyWith(
            color: tone.foreground(tokens.colorScheme),
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      subtitle: secondary,
      meta: [
        if (phone != null) AppMetaItem(icon: LucideIcons.phone, label: phone),
      ],
      trailing: _statusBadge(l10n),
    );
  }

  Widget? _statusBadge(AppLocalizations l10n) {
    if (user.requireAttention) {
      return AppBadge(
        variant: AppBadgeVariant.warning,
        child: Text(l10n.crmRequireAttention),
      );
    }
    if (user.archived) {
      return AppBadge.outline(child: Text(l10n.crmArchived));
    }
    if (user.isGuest) {
      return AppBadge(child: Text(l10n.crmGuestUser));
    }
    return null;
  }
}
