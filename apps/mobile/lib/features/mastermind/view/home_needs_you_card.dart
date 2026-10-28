import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Needs-you first: up to three normal items, each opening its detail, then a
/// trailing Security group.
///
/// Security rows are one fixed line each, with no tap target, no count and no
/// severity, and never feed [MastermindHomeModel.needsYouCount].
class HomeNeedsYouCard extends StatelessWidget {
  const HomeNeedsYouCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasNormal = model.needsYou.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: l10n.mastermindNeedsYouTitle,
          children: [
            if (!hasNormal)
              AppGroupedRow(
                leading: const AppIconTile(icon: AppIcons.check),
                title: Text(
                  model.security.isEmpty
                      ? l10n.mastermindAllCaughtUp
                      : l10n.mastermindNothingNeedsReply,
                ),
              ),
            for (final item in model.needsYouShown) _NeedsYouRow(item: item),
            if (hasNormal)
              AppGroupedRow(
                title: Text(l10n.mastermindNeedsYouSeeAll(model.needsYouCount)),
                showChevron: true,
                onTap: () => context.go(Routes.mastermindInbox),
              ),
          ],
        ),
        if (model.security.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindSecurityGroup,
            children: [
              for (final item in model.security)
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.shield),
                  title: Text(securityLine(l10n, item)),
                  trailing: AppBadge.outline(
                    child: Text(MastermindLabels.laneState(l10n, item.state)),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// `<Product> · security fix`, or just "Security fix" with no product.
String securityLine(AppLocalizations l10n, SecurityItem item) =>
    item.product == null
    ? l10n.mastermindSecurityFix
    : l10n.mastermindSecurityLine(MastermindLabels.product(item.product!));

class _NeedsYouRow extends StatelessWidget {
  const _NeedsYouRow({required this.item});

  final NeedsYou item;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedRow(
      title: Text(item.title),
      showChevron: true,
      // Pushed, so Back returns to Home.
      onTap: () => context.push(Routes.mastermindInboxItemPath(item.id)),
      subtitle: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          if (item.kind case final kind?)
            AppBadge(child: Text(MastermindLabels.itemKind(l10n, kind))),
          if (item.product case final product?)
            AppBadge.outline(child: Text(MastermindLabels.product(product))),
        ],
      ),
    );
  }
}
