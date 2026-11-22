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

  static String? avatarUrl(Object? value) {
    if (value is! String) return null;
    final uri = Uri.tryParse(value);
    return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty
        ? uri.toString()
        : null;
  }

  @override
  Widget build(BuildContext context) {
    final label = visibleName(address, name, profile, context.l10n.mailMember);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        MailReaderAvatar(
          label: label,
          profile: profile,
          radius: compact ? 12 : 22,
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

/// The plain text Share hands to the system sheet. The sender's address is
/// included only for a person whose profile affirms it is visible; a hidden,
/// unknown or unresolved sender is named without it.
String mailShareText({
  required String subject,
  required Map<String, dynamic> message,
  required Map<String, dynamic>? profile,
  required String hiddenFallback,
}) {
  final address = (message['fromAddress'] as String? ?? '').trim();
  final effectiveProfile =
      profile ??
      (message['fromProfile'] is Map<String, dynamic>
          ? message['fromProfile'] as Map<String, dynamic>
          : null);
  final emailAllowed = effectiveProfile?['emailVisible'] == true;
  final label = MailReaderIdentity.visibleName(
    address,
    message['fromName'] as String?,
    emailAllowed
        ? effectiveProfile
        : {...?effectiveProfile, 'emailVisible': false},
    hiddenFallback,
  );
  final sender = !emailAllowed || address.isEmpty || label == address
      ? label
      : '$label <$address>';
  final body =
      (message['bodyText'] as String?) ?? (message['snippet'] as String?) ?? '';
  return [subject, sender, body].where((part) => part.isNotEmpty).join('\n\n');
}

/// The circular avatar for a visible mail identity: the profile photo when
/// it is an HTTPS URL, otherwise up to two initials of [label].
class MailReaderAvatar extends StatelessWidget {
  const MailReaderAvatar({
    required this.label,
    this.profile,
    this.radius = 16,
    super.key,
  });

  /// The already privacy-filtered visible name.
  final String label;
  final Map<String, dynamic>? profile;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final words = label.split('@').first.trim().split(RegExp(r'\s+'));
    final initials = words
        .where((word) => word.isNotEmpty)
        .take(2)
        .map((word) => word.characters.first)
        .join()
        .toUpperCase();
    final avatar = MailReaderIdentity.avatarUrl(profile?['avatarUrl']);
    final colors = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: colors.surfaceContainerHighest,
      foregroundColor: colors.onSurfaceVariant,
      foregroundImage: avatar == null ? null : NetworkImage(avatar),
      onForegroundImageError: avatar == null ? null : (_, _) {},
      child: Text(
        initials,
        style: TextStyle(fontSize: radius * 0.8, fontWeight: FontWeight.w600),
      ),
    );
  }
}
