import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/app_horizontal_scroll_view.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Horizontal strip of the workspace total (an ink card) followed by one
/// hue card per wallet, each in its own currency. Tapping a wallet opens it.
class FinanceBalanceStrip extends StatelessWidget {
  const FinanceBalanceStrip({required this.state, super.key});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height:
          136 +
          (MediaQuery.textScalerOf(context).scale(32) - 32).clamp(
                0.0,
                double.infinity,
              ) *
              3,
      child: AppHorizontalViewport(
        child: ListView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          children: [
            _TotalCard(state: state),
            for (final wallet in state.wallets) ...[
              const SizedBox(width: 10),
              FinanceWalletCard(
                wallet: wallet,
                fallbackCurrency: state.workspaceCurrency,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TotalCard extends StatelessWidget {
  const _TotalCard({required this.state});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final ink = colors.primaryForeground;
    final l10n = context.l10n;
    return Container(
      key: const ValueKey('finance-total-card'),
      width: 236,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.primary,
        borderRadius: BorderRadius.circular(tokens.radiusXl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 8,
            children: [
              Icon(LucideIcons.wallet, size: 18, color: ink),
              Expanded(
                child: Text(
                  l10n.financeTotal,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.ui.copyWith(color: ink),
                ),
              ),
              _Badge(label: state.workspaceCurrency, color: ink),
            ],
          ),
          const Spacer(),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: FinanceAmountText(
              state.totalBalance,
              state.workspaceCurrency,
              approximate: state.hasCrossCurrencyWallets,
              color: ink,
              style: tokens.typography.numeric.copyWith(
                fontSize: 26,
                height: 32 / 26,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            l10n.financeWalletCount(state.wallets.length),
            style: tokens.typography.caption.copyWith(
              color: ink.withValues(alpha: 0.72),
            ),
          ),
        ],
      ),
    );
  }
}

/// A wallet as a 176 dp hue card: icon and name, the balance in the
/// wallet's own currency and its kind.
class FinanceWalletCard extends StatelessWidget {
  const FinanceWalletCard({
    required this.wallet,
    required this.fallbackCurrency,
    super.key,
  });

  final Wallet wallet;
  final String fallbackCurrency;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final l10n = context.l10n;
    final hue = financeHue(
      context,
      financeCategoryHueName(name: wallet.name ?? wallet.id),
    );
    final isCredit = wallet.type?.toUpperCase() == 'CREDIT';
    final walletType = isCredit
        ? l10n.financeWalletTypeCredit
        : l10n.financeWalletTypeStandard;
    final currency = (wallet.currency ?? fallbackCurrency).toUpperCase();
    return Material(
      color: hue.calm,
      borderRadius: BorderRadius.circular(tokens.radiusXl),
      child: InkWell(
        key: ValueKey('finance-wallet-card-${wallet.id}'),
        borderRadius: BorderRadius.circular(tokens.radiusXl),
        onTap: () => context.push(Routes.walletDetailPath(wallet.id)),
        child: Container(
          width: 176,
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                spacing: 8,
                children: [
                  Icon(
                    isCredit ? LucideIcons.creditCard : LucideIcons.landmark,
                    size: 18,
                    color: hue.ink,
                  ),
                  Expanded(
                    child: Text(
                      wallet.name ?? l10n.financeWallet,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.uiSm.copyWith(
                        color: hue.ink,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const Spacer(),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerStart,
                child: FinanceAmountText(
                  wallet.balance ?? 0,
                  wallet.currency ?? fallbackCurrency,
                  color: hue.ink,
                  style: tokens.typography.numeric.copyWith(
                    fontSize: 18,
                    height: 24 / 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$walletType · $currency',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.caption.copyWith(
                  color: hue.ink.withValues(alpha: 0.8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Text(
        label.toUpperCase(),
        style: context.tokens.typography.caption.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
  );
}
