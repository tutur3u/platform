import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_rel_time.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One digest row: kind glyph, title, an optional reason and owner, and a
/// relative time. Tappable only when [onOpen] is set.
class CatchupRow extends StatelessWidget {
  const CatchupRow({
    required this.item,
    required this.now,
    required this.sectionKey,
    this.productName,
    this.onOpen,
    super.key,
  });

  final CatchupItem item;
  final DateTime now;
  final CatchupSectionKey sectionKey;
  final String? productName;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    final title = item.neutral
        ? l10n.mastermindCatchupSecurityUpdate
        : item.title;
    final blocked = sectionKey == CatchupSectionKey.blocked && !item.neutral;
    final reason = blocked ? item.reason : null;
    final owner = item.ownerName == null || item.neutral
        ? null
        : l10n.mastermindCatchupOnIt(item.ownerName!);
    final at = item.at;
    final spoken = [
      title,
      ?productName,
      ?reason,
      ?owner,
      if (at != null) mastermindAgeText(l10n, now.difference(at)),
      if (onOpen != null && item.entity != null) l10n.mastermindOpensItem,
      if (onOpen != null && item.entity == null)
        l10n.mastermindCatchupOpensLink,
    ].join('. ');
    final meta = Wrap(
      spacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (owner != null) Text(owner),
        if (at != null) CatchupRelTime(at: at, now: now),
      ],
    );
    return Semantics(
      container: true,
      label: spoken,
      button: onOpen != null,
      onTap: onOpen,
      excludeSemantics: true,
      child: AppGroupedRow(
        key: ValueKey('catchup-row-${item.id}'),
        leading: AppIconTile(icon: _icon(item), tone: _tone(item, sectionKey)),
        title: Text(title, maxLines: mastermindLargeText(context) ? null : 2),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (reason != null) Text(reason, style: TextStyle(color: muted)),
            meta,
          ],
        ),
        onTap: onOpen,
        showChevron: onOpen != null,
      ),
    );
  }
}

IconData _icon(CatchupItem item) => item.neutral
    ? LucideIcons.shield
    : switch (item.kind) {
        CatchupItemKind.decision => LucideIcons.diamond,
        CatchupItemKind.merge => LucideIcons.gitMerge,
        CatchupItemKind.release => LucideIcons.tag,
        CatchupItemKind.deploy => LucideIcons.rocket,
        CatchupItemKind.lane => LucideIcons.briefcase,
        CatchupItemKind.risk => LucideIcons.triangleAlert,
        CatchupItemKind.usage => LucideIcons.chartLine,
        CatchupItemKind.incident => LucideIcons.circleAlert,
        CatchupItemKind.answered => LucideIcons.check,
        CatchupItemKind.unknown => LucideIcons.circleDot,
      };

AppTone _tone(CatchupItem item, CatchupSectionKey section) {
  if (item.neutral) return AppTone.neutral;
  if (item.kind == CatchupItemKind.incident ||
      section == CatchupSectionKey.blocked) {
    return AppTone.destructive;
  }
  if (item.importance == CatchupImportance.high ||
      section == CatchupSectionKey.needsYou) {
    return AppTone.warning;
  }
  return switch (section) {
    CatchupSectionKey.shipped => AppTone.success,
    _ => AppTone.neutral,
  };
}
