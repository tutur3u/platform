import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Picks another saved account, or dismisses with null.
///
/// Rows include remove; see [AuthCubit.removeAccount].
Future<String?> showAccountSwitcherSheet(BuildContext context) async {
  final authCubit = context.read<AuthCubit>();

  return showAdaptiveSheet<String?>(
    context: context,
    maxDialogWidth: 420,
    builder: (dialogContext) {
      return BlocProvider.value(
        value: authCubit,
        child: const _AccountSwitcherSheet(),
      );
    },
  );
}

class _AccountSwitcherSheet extends StatefulWidget {
  const _AccountSwitcherSheet();

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
    final name = account.displayName ?? account.email ?? account.id;
    final subtitle = account.email ?? account.id;

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
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: isSelected
                                ? theme.colorScheme.primary.withValues(
                                    alpha: 0.14,
                                  )
                                : theme.colorScheme.background,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            isSelected
                                ? Icons.check_circle_rounded
                                : Icons.person_outline_rounded,
                            size: 18,
                            color: isSelected
                                ? theme.colorScheme.primary
                                : theme.colorScheme.foreground,
                          ),
                        ),
                        const shad.Gap(12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (subtitle.trim().isNotEmpty) ...[
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
