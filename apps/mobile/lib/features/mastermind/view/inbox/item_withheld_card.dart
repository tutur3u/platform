import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// An open ask whose full detail the hub withholds (`GET /v1/asks/<id>` is a
/// 404, as for every sensitive item): a lock glyph, "Details are on the Mac",
/// the owner and age. No title, ask text, options or reply.
class ItemWithheldCard extends StatelessWidget {
  const ItemWithheldCard({required this.item, required this.now, super.key});

  final NeedsYou item;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final owner = item.by;
    final created = item.createdAt;
    final meta = [
      ?owner,
      if (created != null) mastermindAgeText(l10n, now.difference(created)),
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-item',
          locations: {Routes.mastermindInboxItemPath(item.id)},
          title: switch (item.kind) {
            final kind? => MastermindLabels.itemKind(l10n, kind),
            null => l10n.mastermindAskTitle,
          },
          showLeadingBrand: false,
        ),
        AppGroupedSection.spaced(
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.lock),
              title: Text(
                l10n.mastermindItemOpenOnMac,
                style: tokens.typography.base,
              ),
              subtitle: meta.isEmpty ? null : Text(meta),
            ),
          ],
        ),
      ],
    );
  }
}
