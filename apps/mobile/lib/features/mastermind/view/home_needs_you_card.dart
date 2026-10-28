import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/widgets/show_all_row.dart';
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
          captionTrailing: hasNormal ? Text('${model.needsYouCount}') : null,
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
            for (final item in model.needsYouShown)
              InboxItemTile(
                item: item,
                now: model.generatedAt,
                showKindIcon: true,
              ),
            if (model.needsYouCount > MastermindHomeModel.needsYouPreview)
              MastermindShowAllRow(
                count: model.needsYouCount,
                onTap: () => context.go(inboxLocation()),
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
