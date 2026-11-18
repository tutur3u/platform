part of 'finance_page.dart';

class _OverviewWallet extends StatelessWidget {
  const _OverviewWallet({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final type = tokens.typography;
    final colors = tokens.colorScheme;
    final isCredit = wallet.type == 'CREDIT';
    final creditTone = FinanceTone.transfer.colors(context);
    final isZero = isWalletDisplayNetZero(
      wallet: wallet,
      workspaceCurrency: workspaceCurrency,
      exchangeRates: exchangeRates,
    );
    final fill = isZero
        ? colors.muted
        : (isCredit ? creditTone.fill : colors.card);
    final ink = isZero
        ? AppearanceContrast.ensureContrast(
            colors.mutedForeground,
            against: fill,
            target: AppearanceContrast.aaText,
          )
        : (isCredit ? creditTone.ink : colors.foreground);
    final captionInk = AppearanceContrast.ensureContrast(
      isCredit && !isZero ? ink : colors.mutedForeground,
      against: fill,
      target: AppearanceContrast.aaText,
    );
    final balance = wallet.balance ?? 0;
    final currency = wallet.currency ?? workspaceCurrency;
    final converted =
        currency.trim().toUpperCase() == workspaceCurrency.trim().toUpperCase()
        ? null
        : convertCurrency(balance, currency, workspaceCurrency, exchangeRates);
    return SizedBox(
      width: 168,
      child: AppCard(
        fillColor: fill,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        onTap: () => context.push(Routes.walletDetailPath(wallet.id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              spacing: 8,
              children: [
                WalletVisualAvatar(
                  icon: wallet.icon,
                  imageSrc: wallet.imageSrc,
                  fallbackIcon: isCredit
                      ? Icons.credit_card_outlined
                      : Icons.account_balance_wallet_outlined,
                  backgroundColor: ink.withValues(alpha: 0.10),
                  foregroundColor: ink,
                  size: 28,
                ),
                Expanded(
                  child: Text(
                    isCredit
                        ? context.l10n.financeWalletTypeCredit
                        : context.l10n.financeWalletTypeStandard,
                    textAlign: TextAlign.end,
                    style: type.caption.copyWith(color: captionInk),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              wallet.name ?? '—',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.small.copyWith(
                color: ink,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                _overviewAmount(balance, currency, showAmounts, signed: false),
                style: type.numeric.copyWith(color: ink, fontSize: 16),
              ),
            ),
            if (converted != null) ...[
              const SizedBox(height: 4),
              Text(
                maskFinanceValue(
                  '≈ ${formatCurrency(converted, workspaceCurrency)}',
                  showAmounts: showAmounts,
                ),
                style: type.caption.copyWith(color: captionInk),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _OverviewTransaction extends StatelessWidget {
  const _OverviewTransaction({
    required this.transaction,
    required this.currency,
    required this.showAmounts,
    required this.onTap,
  });

  final Transaction transaction;
  final String currency;
  final bool showAmounts;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final amount = transaction.amount;
    final tone = transaction.isTransfer
        ? FinanceTone.transfer
        : ((amount ?? 0) < 0 ? FinanceTone.expense : FinanceTone.income);
    final date = (transaction.takenAt ?? transaction.createdAt)?.toLocal();
    final locale = Localizations.localeOf(context).toString();
    final subtitle = [
      transaction.categoryName,
      transaction.walletName,
      if (date != null) DateFormat.MMMd(locale).add_jm().format(date),
    ].nonNulls.where((value) => value.trim().isNotEmpty).join(' · ');
    final type = context.tokens.typography;
    return LayoutBuilder(
      builder: (context, constraints) => AppRichRow(
        leading: FinanceToneIcon(
          icon: resolveTransactionCategoryIcon(transaction),
          tone: tone,
        ),
        title: (transaction.description?.trim().isNotEmpty ?? false)
            ? transaction.description!.trim()
            : transaction.categoryName ?? transaction.walletName ?? '—',
        subtitle: subtitle.isEmpty ? null : subtitle,
        trailing: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.32),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerEnd,
            child: Text(
              amount == null
                  ? financeMaskedAmountPlaceholder
                  : _overviewAmount(amount, currency, showAmounts),
              style: type.numeric.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ),
        onTap: onTap,
      ),
    );
  }
}
