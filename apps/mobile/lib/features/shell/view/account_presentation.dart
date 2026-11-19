import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';

typedef AccountIdentity = ({
  String id,
  String name,
  String? email,
  String? url,
});

List<StoredAuthAccount> sortStoredAccountsByRecent(
  Iterable<StoredAuthAccount> accounts,
) => [...accounts]..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));

String? _nonEmpty(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

String accountPrimaryLabel(StoredAuthAccount account) =>
    savedAccountIdentity(account).name;

String? accountSecondaryLabel(StoredAuthAccount account) =>
    savedAccountIdentity(account).email;

AccountIdentity savedAccountIdentity(StoredAuthAccount account) => _identity(
  account.id,
  account.displayName,
  account.email,
  account.avatarUrl,
);

AccountIdentity? activeAccountIdentity(
  AuthState state, {
  UserProfile? profile,
  String? avatarUrl,
}) {
  final user = state.user;
  if (user == null) return null;
  final saved = state.accounts
      .where((entry) => entry.id == user.id)
      .firstOrNull;
  final sameProfile = profile?.id == user.id ? profile : null;
  return _identity(
    user.id,
    _nonEmpty(sameProfile?.displayName) ??
        _nonEmpty(sameProfile?.fullName) ??
        _nonEmpty(user.userMetadata?['display_name']) ??
        _nonEmpty(user.userMetadata?['full_name']) ??
        saved?.displayName,
    _nonEmpty(sameProfile?.email) ?? _nonEmpty(user.email) ?? saved?.email,
    sameProfile == null
        ? _nonEmpty(user.userMetadata?['avatar_url']) ?? saved?.avatarUrl
        : avatarUrl ?? sameProfile.avatarUrl,
  );
}

AccountIdentity _identity(String id, String? name, String? email, String? url) {
  final label = _nonEmpty(name) ?? _nonEmpty(email) ?? id;
  final address = _nonEmpty(email);
  return (
    id: id,
    name: label,
    email: label == address ? null : address,
    url: url,
  );
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty);
  if (parts.isEmpty) return '?';
  final first = parts.first.characters.first.toUpperCase();
  if (parts.length == 1) return first;
  return '$first${parts.last.characters.first.toUpperCase()}';
}

class AccountAvatar extends StatelessWidget {
  const AccountAvatar({
    required this.identity,
    this.isSelected = false,
    this.size = 42,
    super.key,
  });

  final AccountIdentity identity;
  final bool isSelected;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final url = normalizeAvatarUrl(identity.url);
    final uri = url == null ? null : Uri.tryParse(url);
    final fallback = Center(
      child: Text(
        _initials(identity.name),
        maxLines: 1,
        style: tokens.typography.small.copyWith(
          color: isSelected ? c.primary : c.foreground,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: isSelected ? c.primary.withValues(alpha: 0.12) : c.muted,
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child:
          url != null &&
              uri?.hasAuthority == true &&
              uri!.userInfo.isEmpty &&
              const {'https', 'http'}.contains(uri.scheme)
          ? Image(
              key: ValueKey(identity.id),
              image: ResizeImage(
                profileMediaImage(url, identity.id),
                width: (size * MediaQuery.devicePixelRatioOf(context)).ceil(),
              ),
              fit: BoxFit.cover,
              frameBuilder: (context, child, frame, sync) =>
                  sync || frame != null ? child : fallback,
              errorBuilder: (_, _, _) => fallback,
            )
          : fallback,
    );
  }
}
