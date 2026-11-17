import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

/// Presentation of an already authorized, workspace-scoped person result.
class MailReaderIdentity extends StatelessWidget {
  const MailReaderIdentity({
    required this.address,
    this.name,
    this.profile,
    this.compact = false,
    this.selectableLabel = false,
    super.key,
  });
  final String address;
  final String? name;
  final Map<String, dynamic>? profile;
  final bool compact;
  final bool selectableLabel;

  static String visibleName(
    String address,
    String? name,
    Map<String, dynamic>? profile,
    String hiddenFallback,
  ) {
    final hidden = profile?['emailVisible'] == false;
    final key = address.trim().toLowerCase();
    final resolved = (profile?['displayName'] as String?)?.trim();
    bool visible(String value) =>
        !hidden || key.isEmpty || !value.toLowerCase().contains(key);
    if (resolved != null && resolved.isNotEmpty && visible(resolved)) {
      return resolved;
    }
    if (name != null && name.trim().isNotEmpty && visible(name.trim())) {
      return name.trim();
    }
    return hidden ? hiddenFallback : address;
  }

  @override
  Widget build(BuildContext context) {
    final label = visibleName(address, name, profile, context.l10n.mailMember);
    final words = label.split('@').first.trim().split(RegExp(r'\s+'));
    final initials = words
        .where((word) => word.isNotEmpty)
        .take(2)
        .map((word) => word.characters.first)
        .join()
        .toUpperCase();
    final avatar = profile?['avatarUrl'] as String?;
    final colors = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: compact ? 12 : 22,
          backgroundColor: colors.surfaceContainerHighest,
          foregroundColor: colors.onSurfaceVariant,
          foregroundImage: avatar == null || avatar.isEmpty
              ? null
              : NetworkImage(avatar),
          onForegroundImageError: avatar == null || avatar.isEmpty
              ? null
              : (_, _) {},
          child: Text(initials, style: TextStyle(fontSize: compact ? 10 : 14)),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: selectableLabel
              ? SelectableText(label)
              : Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }
}
