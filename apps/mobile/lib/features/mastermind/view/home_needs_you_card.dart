import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
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
            for (final item in model.needsYouShown) _NeedsYouRow(item: item),
            if (model.needsYouCount > MastermindHomeModel.needsYouPreview)
              MastermindShowAllRow(
                count: model.needsYouCount,
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

/// One item: its kind as a leading glyph, its display title, and the product
/// on the second line unless the title already names it.
class _NeedsYouRow extends StatelessWidget {
  const _NeedsYouRow({required this.item});

  final NeedsYou item;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = itemDisplayTitle(l10n, item);
    final kind = item.kind;
    final product = switch (item.product) {
      final product? when !title.contains(product.wireName) =>
        MastermindLabels.product(product),
      _ => null,
    };
    return AppGroupedRow(
      leading: AppIconTile(
        icon: switch (kind) {
          ItemKind.decision => LucideIcons.diamond,
          ItemKind.action => LucideIcons.zap,
          ItemKind.fyi => LucideIcons.info,
          null => LucideIcons.messageSquareMore,
        },
        tone: kind == ItemKind.fyi ? AppTone.neutral : AppTone.warning,
      ),
      title: Text(title),
      subtitle: product == null ? null : Text(product),
      semanticLabel: [
        if (kind != null) MastermindLabels.itemKind(l10n, kind),
        title,
        ?product,
      ].join('. '),
      showChevron: true,
      // Pushed, so Back returns to Home.
      onTap: () => context.push(Routes.mastermindInboxItemPath(item.id)),
    );
  }
}
