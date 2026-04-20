import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

List<StoredAuthAccount> sortStoredAccountsByRecent(
  Iterable<StoredAuthAccount> accounts,
) {
  return [...accounts]
    ..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));
}

String accountPrimaryLabel(StoredAuthAccount account) {
  final name = account.displayName?.trim();
  if (name != null && name.isNotEmpty) {
    return name;
  }
  final email = account.email?.trim();
  if (email != null && email.isNotEmpty) {
    return email;
  }
  return account.id;
}

String? accountSecondaryLabel(StoredAuthAccount account) {
  final primary = accountPrimaryLabel(account);
  final email = account.email?.trim();
  if (email == null || email.isEmpty || email == primary) {
    return null;
  }
  return email;
}

String accountInitials(StoredAuthAccount account) {
  final source = account.displayName?.trim().isNotEmpty == true
      ? account.displayName!.trim()
      : (account.email?.trim().isNotEmpty == true
            ? account.email!.trim()
            : account.id);
  return _initialsFromDisplayString(source);
}

String _initialsFromDisplayString(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'U';
  }
  final parts = trimmed.split(RegExp(r'\s+'));
  if (parts.length == 1) {
    return parts.first.characters.first.toUpperCase();
  }
  final first = parts.first.characters.first.toUpperCase();
  final last = parts.last.characters.first.toUpperCase();
  return '$first$last';
}

class AccountAvatar extends StatelessWidget {
  const AccountAvatar({
    required this.account,
    this.isSelected = false,
    this.size = 42,
    super.key,
  });

  final StoredAuthAccount account;
  final bool isSelected;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final url = normalizeAvatarUrl(account.avatarUrl);
    final initials = accountInitials(account);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.48)
              : theme.colorScheme.border.withValues(alpha: 0.45),
          width: isSelected ? 2 : 1,
        ),
        color: colorScheme.surfaceContainerHighest,
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null
          ? Image(
              image: CachedNetworkImageProvider(
                url,
                cacheKey: avatarIdentityKeyForUrl(url) ?? url,
              ),
              fit: BoxFit.cover,
              gaplessPlayback: true,
              errorBuilder: (context, error, stackTrace) =>
                  const _AccountAvatarPlaceholder(),
            )
          : _AccountAvatarInitials(initials: initials),
    );
  }
}

class _AccountAvatarPlaceholder extends StatelessWidget {
  const _AccountAvatarPlaceholder();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colorScheme.surfaceContainerHighest,
      child: Center(
        child: Icon(
          Icons.person_outline_rounded,
          size: 20,
          color: colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _AccountAvatarInitials extends StatelessWidget {
  const _AccountAvatarInitials({required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colorScheme.surfaceContainerHighest,
      child: Center(
        child: Text(
          initials,
          style: theme.typography.small.copyWith(
            fontWeight: FontWeight.w700,
            color: colorScheme.onSurface,
          ),
        ),
      ),
    );
  }
}
