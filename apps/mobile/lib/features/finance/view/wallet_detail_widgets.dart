import 'package:flutter/material.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart' show LucideIcons;
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';

/// The wallet's balance card: visual, kind and currency, the balance in its
/// own currency (with a workspace-currency estimate and credit limit when
/// they apply), Transfer and Edit. Adding a transaction is the dock's
/// primary action.
class WalletBalanceHero extends StatelessWidget {
  const WalletBalanceHero({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
    this.onTransfer,
    this.onEdit,
    this.onCheckpoints,
    super.key,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback? onTransfer;
  final VoidCallback? onEdit;
  final VoidCallback? onCheckpoints;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final ink = colors.primaryForeground;
    final l10n = context.l10n;
    final isCredit = wallet.type?.toUpperCase() == 'CREDIT';
    final currency = (wallet.currency ?? workspaceCurrency).toUpperCase();
    final balance = wallet.balance ?? 0;
    final converted =
        workspaceCurrency.isEmpty || currency == workspaceCurrency.toUpperCase()
        ? null
        : convertCurrency(balance, currency, workspaceCurrency, exchangeRates);
    final caption = tokens.typography.caption.copyWith(
      color: ink.withValues(alpha: 0.78),
    );
    final limit = wallet.limit;
    final kind = isCredit
        ? l10n.financeWalletTypeCredit
        : l10n.financeWalletTypeStandard;
    return Container(
      key: const ValueKey('finance-wallet-hero'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.primary,
        borderRadius: BorderRadius.circular(tokens.radiusXl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: AppSpacing.sm,
            children: [
              WalletVisualAvatar(
                icon: wallet.icon,
                imageSrc: wallet.imageSrc,
                fallbackIcon: resolvePlatformIcon(
                  wallet.icon,
                  fallback: isCredit
                      ? LucideIcons.creditCard
                      : LucideIcons.wallet,
                ),
                size: 32,
                backgroundColor: ink.withValues(alpha: 0.16),
                foregroundColor: ink,
              ),
              Expanded(
                child: Text(
                  '$kind · $currency',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: caption,
                ),
              ),
              if (onCheckpoints != null)
                IconTheme.merge(
                  data: IconThemeData(color: ink),
                  child: AppIconButton(
                    icon: Icon(LucideIcons.listChecks, color: ink),
                    tooltip: l10n.financeCheckpointsShortLabel,
                    onPressed: onCheckpoints,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: FinanceAmountText(
                balance,
                currency,
                color: ink,
                style: tokens.typography.numeric.copyWith(
                  fontSize: 32,
                  height: 40 / 32,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          if (converted != null || (isCredit && limit != null))
            Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: FinanceMaskedText(
                context,
                [
                  if (converted != null)
                    financeMoney(
                      context,
                      converted,
                      workspaceCurrency,
                      approximate: true,
                    ),
                  if (isCredit && limit != null)
                    [
                      l10n.financeWalletCreditLimit,
                      financeMoney(context, limit, currency),
                    ].join(' '),
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: caption,
              ),
            ),
          if (onTransfer != null || onEdit != null) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              spacing: AppSpacing.sm,
              children: [
                if (onTransfer != null)
                  _HeroAction(
                    key: const ValueKey('finance-wallet-transfer'),
                    icon: LucideIcons.arrowLeftRight,
                    label: l10n.financeTransfer,
                    onPressed: onTransfer!,
                  ),
                if (onEdit != null)
                  _HeroAction(
                    key: const ValueKey('finance-wallet-edit'),
                    icon: LucideIcons.pencil,
                    label: l10n.commonEdit,
                    onPressed: onEdit!,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroAction extends StatelessWidget {
  const _HeroAction({
    required this.icon,
    required this.label,
    required this.onPressed,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final ink = tokens.colorScheme.primaryForeground;
    final radius = BorderRadius.circular(tokens.radiusLg);
    return Expanded(
      child: Padding(
        padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
        child: Material(
          color: ink.withValues(alpha: 0.14),
          borderRadius: radius,
          child: InkWell(
            borderRadius: radius,
            onTap: onPressed,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minHeight: kMinInteractiveDimension,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  spacing: AppSpacing.xs,
                  children: [
                    Icon(icon, size: 16, color: ink),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.uiSm.copyWith(
                          color: ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cold-load layout of the wallet page: hero, period bar, summary, rows.
class WalletDetailSkeleton extends StatelessWidget {
  const WalletDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    label: context.l10n.commonLoading,
    child: const AppPageListView(
      physics: AlwaysScrollableScrollPhysics(),
      children: [
        FinanceSkeleton(height: 168),
        SizedBox(height: AppLayout.itemGap),
        FinanceSkeleton(height: 44),
        SizedBox(height: AppLayout.itemGap),
        FinanceSkeleton(height: 140),
        SizedBox(height: AppLayout.sectionGap),
        AppSkeletonRows(count: 4),
      ],
    ),
  );
}
