part of 'wallets_page.dart';

/// One wallet as a dense row: visual, name, kind and currency, and the
/// balance right-aligned in tabular figures. Long-press offers Edit and
/// Delete.
class _WalletRow extends StatelessWidget {
  const _WalletRow({
    required this.wallet,
    required this.currency,
    required this.showAmounts,
    required this.onTap,
    required this.onEdit,
    required this.onDelete,
  });

  final Wallet wallet;
  final String currency;
  final bool showAmounts;
  final VoidCallback onTap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  Future<void> _openActions(BuildContext context) async {
    final l10n = context.l10n;
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: wallet.name ?? l10n.financeWallet,
      selected: null,
      choices: [
        if (onEdit != null)
          AppSheetChoice(
            value: 'edit',
            label: l10n.financeEditWallet,
            icon: LucideIcons.pencil,
          ),
        if (onDelete != null)
          AppSheetChoice(
            value: 'delete',
            label: l10n.financeDeleteWallet,
            icon: LucideIcons.trash2,
          ),
      ],
    );
    switch (picked) {
      case 'edit':
        onEdit?.call();
      case 'delete':
        onDelete?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = context.tokens;
    final isCredit = wallet.type == 'CREDIT';
    final icon = resolvePlatformIcon(
      wallet.icon,
      fallback: isCredit ? LucideIcons.creditCard : LucideIcons.wallet,
    );
    final walletType = isCredit
        ? l10n.financeWalletTypeCredit
        : l10n.financeWalletTypeStandard;
    final balance = wallet.balance ?? 0;
    return AppRichRow(
      key: ValueKey('finance-wallet-row-${wallet.id}'),
      leading: WalletVisualAvatar(
        icon: wallet.icon,
        imageSrc: wallet.imageSrc,
        fallbackIcon: icon,
      ),
      title: wallet.name ?? l10n.financeWallet,
      subtitle: '$walletType · ${currency.toUpperCase()}',
      trailing: money.FinanceMaskedText(
        context,
        money.maskFinanceValue(
          money.formatFinanceAmount(balance, currency),
          showAmounts: showAmounts,
        ),
        maxLines: 1,
        style: tokens.typography.numeric.copyWith(
          fontWeight: FontWeight.w700,
          color: showAmounts && balance < 0
              ? tokens.colorScheme.destructive
              : null,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      onTap: onTap,
      onLongPress: onEdit == null && onDelete == null
          ? null
          : () => unawaited(_openActions(context)),
    );
  }
}
