import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/presentation/security_labels.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Providers this app can link. Microsoft linking is unavailable on mobile.
const List<OAuthProvider> linkableIdentityProviders = [
  OAuthProvider.google,
  OAuthProvider.apple,
  OAuthProvider.github,
];

/// Where a list on the security page stands: still loading, shown, or failed
/// with nothing earlier to show.
enum SecurityListLoad { loading, ready, failed }

/// Connected sign-in accounts with disconnect actions, followed by the
/// providers that can still be connected.
class AccountConnectionsSection extends StatelessWidget {
  const AccountConnectionsSection({
    required this.load,
    required this.identities,
    required this.busy,
    required this.onDisconnect,
    required this.onConnect,
    required this.onRetry,
    super.key,
  });

  final SecurityListLoad load;
  final List<UserIdentity> identities;
  final bool busy;
  final ValueChanged<UserIdentity> onDisconnect;
  final ValueChanged<OAuthProvider> onConnect;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canDisconnect = !busy && identities.length >= 2;
    final connectable = [
      for (final provider in linkableIdentityProviders)
        if (!identities.any((identity) => identity.provider == provider.name))
          provider,
    ];
    return AppGroupedSection(
      caption: l10n.securityConnectionsTitle,
      footer: load == SecurityListLoad.ready
          ? l10n.securityConnectionsDescription
          : null,
      children: switch (load) {
        SecurityListLoad.loading => const [AppSkeletonRows()],
        // Without the list, a Connect row could offer a provider that is
        // already linked, so a failed load offers only a retry.
        SecurityListLoad.failed => [
          AppStateMessage.inline(
            icon: LucideIcons.link,
            tone: AppTone.destructive,
            title: l10n.securityConnectionsLoadFailedTitle,
            message: l10n.securitySessionsLoadFailedMessage,
            actionLabel: l10n.commonRetry,
            onAction: onRetry,
          ),
        ],
        SecurityListLoad.ready => [
          for (final identity in identities)
            _ConnectionRow(
              identity: identity,
              onDisconnect: canDisconnect ? () => onDisconnect(identity) : null,
            ),
          for (final provider in connectable)
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.plus),
              title: Text(
                l10n.securityConnectProvider(
                  identityProviderName(provider.name),
                ),
              ),
              onTap: busy ? null : () => onConnect(provider),
            ),
        ],
      },
    );
  }
}

class _ConnectionRow extends StatelessWidget {
  const _ConnectionRow({required this.identity, required this.onDisconnect});

  final UserIdentity identity;
  final VoidCallback? onDisconnect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = identityProviderName(identity.provider);
    final email = identity.identityData?['email']?.toString() ?? '';
    return AppGroupedRow(
      leading: const AppIconTile(icon: LucideIcons.link),
      title: Text(name),
      subtitle: email.isEmpty ? null : Text(email),
      trailing: AppButton.ghost(
        size: AppButtonSize.small,
        semanticLabel: l10n.securityDisconnectNamed(name),
        onPressed: onDisconnect,
        child: Text(l10n.securityDisconnect),
      ),
    );
  }
}
