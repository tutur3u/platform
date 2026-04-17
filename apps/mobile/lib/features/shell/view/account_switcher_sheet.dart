import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Picks another saved account, or dismisses with null.
///
/// Rows include remove; see [AuthCubit.removeAccount].
Future<String?> showAccountSwitcherSheet(
  BuildContext context, {
  Future<void> Function()? onAddAccount,
}) async {
  final authCubit = context.read<AuthCubit>();

  return showAdaptiveSheet<String?>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) {
      return BlocProvider.value(
        value: authCubit,
        child: _AccountSwitcherSheet(onAddAccount: onAddAccount),
      );
    },
  );
}

class _AccountSwitcherSheet extends StatefulWidget {
  const _AccountSwitcherSheet({this.onAddAccount});

  final Future<void> Function()? onAddAccount;

  @override
  State<_AccountSwitcherSheet> createState() => _AccountSwitcherSheetState();
}

class _AccountSwitcherSheetState extends State<_AccountSwitcherSheet> {
  String? _removingAccountId;

  Future<void> _removeAccount(StoredAuthAccount account) async {
    final dialogContext = context;
    final emailLabel = account.email?.trim().isNotEmpty == true
        ? account.email!
        : account.id;

    final confirmed = await showSettingsConfirmationDialog(
      context: dialogContext,
      title: dialogContext.l10n.authRemoveAccount,
      description: dialogContext.l10n.authRemoveAccountConfirm(emailLabel),
      confirmLabel: dialogContext.l10n.authRemoveAccount,
      icon: Icons.delete_outline_rounded,
      isDestructive: true,
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() => _removingAccountId = account.id);

    final authCubit = context.read<AuthCubit>();
    final success = await authCubit.removeAccount(account.id);

    if (!mounted) {
      return;
    }

    setState(() => _removingAccountId = null);

    if (!success) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (ctx, _) => shad.Alert.destructive(
          title: Text(
            authCubit.state.error ?? ctx.l10n.authRemoveAccountFailed,
          ),
        ),
      );
      return;
    }

    final remaining = authCubit.state.accounts.length;
    if (remaining <= 1) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, state) {
        final accounts = [...state.accounts]
          ..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));
        final activeId = state.activeAccountId;

        return AppDialogScaffold(
          title: context.l10n.authSwitchAccount,
          description: context.l10n.authSwitchAccountDescription,
          icon: Icons.tune_rounded,
          headerTrailing: shad.PrimaryButton(
            onPressed: () async {
              Navigator.of(context).pop();
              final add = widget.onAddAccount;
              if (add != null) {
                await add();
              }
            },
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.add_rounded, size: 16),
                const shad.Gap(6),
                Text(context.l10n.authAddAccount),
              ],
            ),
          ),
          maxWidth: 420,
          maxHeightFactor: 0.72,
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
          child: accounts.isEmpty
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final account in accounts)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _AccountSwitcherTile(
                          account: account,
                          isSelected: account.id == activeId,
                          isRemoving: _removingAccountId == account.id,
                          onSelect: () =>
                              Navigator.of(context).pop<String?>(account.id),
                          onRemove: () => _removeAccount(account),
                        ),
                      ),
                  ],
                ),
        );
      },
    );
  }
}

String _accountPrimaryLabel(StoredAuthAccount account) {
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

/// Subtitle when it adds information (never duplicate the title line).
String? _accountSecondaryLabel(StoredAuthAccount account) {
  final primary = _accountPrimaryLabel(account);
  final email = account.email?.trim();
  if (email == null || email.isEmpty) {
    return null;
  }
  if (email == primary) {
    return null;
  }
  return email;
}

String _initialsForAccount(StoredAuthAccount account) {
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

class _AccountSwitcherAvatar extends StatelessWidget {
  const _AccountSwitcherAvatar({
    required this.account,
    required this.isSelected,
  });

  final StoredAuthAccount account;
  final bool isSelected;

  static const double _size = 38;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final url = normalizeAvatarUrl(account.avatarUrl);
    final initials = _initialsForAccount(account);

    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.55)
              : theme.colorScheme.border.withValues(alpha: 0.35),
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
                  _AccountSwitcherInitials(initials: initials),
            )
          : _AccountSwitcherInitials(initials: initials),
    );
  }
}

class _AccountSwitcherInitials extends StatelessWidget {
  const _AccountSwitcherInitials({required this.initials});

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

class _AccountSwitcherTile extends StatelessWidget {
  const _AccountSwitcherTile({
    required this.account,
    required this.isSelected,
    required this.isRemoving,
    required this.onSelect,
    required this.onRemove,
  });

  final StoredAuthAccount account;
  final bool isSelected;
  final bool isRemoving;
  final VoidCallback onSelect;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = _accountPrimaryLabel(account);
    final subtitle = _accountSecondaryLabel(account);

    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.10)
              : theme.colorScheme.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.55)
                : theme.colorScheme.border.withValues(alpha: 0.75),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: onSelect,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 8, 14),
                    child: Row(
                      children: [
                        _AccountSwitcherAvatar(
                          account: account,
                          isSelected: isSelected,
                        ),
                        const shad.Gap(12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (subtitle != null &&
                                  subtitle.trim().isNotEmpty) ...[
                                const shad.Gap(4),
                                Text(
                                  subtitle,
                                  style: theme.typography.textSmall.copyWith(
                                    color: theme.colorScheme.mutedForeground,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const shad.Gap(8),
                        Icon(
                          isSelected
                              ? Icons.check_circle_rounded
                              : Icons.radio_button_unchecked_rounded,
                          size: 20,
                          color: isSelected
                              ? theme.colorScheme.primary
                              : theme.colorScheme.mutedForeground,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: isRemoving
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : IconButton(
                      tooltip: context.l10n.authRemoveAccount,
                      onPressed: onRemove,
                      icon: Icon(
                        Icons.delete_outline_rounded,
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
