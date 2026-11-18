part of 'wallets_page.dart';

class _WalletCard extends StatelessWidget {
  const _WalletCard({
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isCredit = wallet.type == 'CREDIT';
    final icon = resolvePlatformIcon(
      wallet.icon,
      fallback: isCredit ? Icons.credit_card_outlined : Icons.wallet_outlined,
    );
    final walletType = isCredit
        ? l10n.financeWalletTypeCredit
        : l10n.financeWalletTypeStandard;
    final subtitle = [
      walletType,
      currency.toUpperCase(),
      if (wallet.description?.trim() case final String description)
        if (description.isNotEmpty) description,
    ].join(' · ');
    return AppGroupedCard(
      children: [
        AppRichRow(
          leading: WalletVisualAvatar(
            icon: wallet.icon,
            imageSrc: wallet.imageSrc,
            fallbackIcon: icon,
          ),
          title: wallet.name ?? l10n.financeWallet,
          subtitle: subtitle,
          trailing: money.FinanceMaskedText(
            context,
            money.maskFinanceValue(
              money.formatFinanceAmount(wallet.balance ?? 0, currency),
              showAmounts: showAmounts,
            ),
          ),
          onTap: onTap,
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            if (onEdit != null)
              AppIconButton(
                icon: const Icon(Icons.edit_outlined),
                tooltip: l10n.financeEditWallet,
                onPressed: onEdit,
              ),
            if (onDelete != null)
              AppIconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: l10n.financeDeleteWallet,
                onPressed: onDelete,
              ),
            const SizedBox(width: AppSpacing.sm),
          ],
        ),
      ],
    );
  }
}
