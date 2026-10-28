import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// The data sources behind the snapshot, degraded ones first, each as a word
/// plus a glyph. Opened from the "N sources degraded" strip and from Home.
Future<void> showMastermindSourcesSheet(
  BuildContext context, {
  required List<Source> sources,
}) => showAppSheet<void>(
  context: context,
  size: AppSheetSize.medium,
  builder: (context) => _SourcesSheet(sources: sources),
);

class _SourcesSheet extends StatelessWidget {
  const _SourcesSheet({required this.sources});

  final List<Source> sources;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // Stable sort: degraded first, otherwise the snapshot's own order.
    final ordered = [
      ...sources.where((source) => source.state != SourceState.ok),
      ...sources.where((source) => source.state == SourceState.ok),
    ];
    return AppSheetScaffold(
      title: l10n.mastermindSourcesTitle,
      slivers: [
        SliverToBoxAdapter(
          child: AppGroupedSection(
            children: [
              for (final source in ordered)
                AppGroupedRow(
                  leading: AppIconTile(
                    icon: source.state == SourceState.ok
                        ? AppIcons.check
                        : AppIcons.warning,
                    tone: source.state == SourceState.ok
                        ? AppTone.neutral
                        : AppTone.warning,
                  ),
                  title: Text(MastermindLabels.sourceName(l10n, source.source)),
                  trailing: AppBadge(
                    variant: source.state == SourceState.ok
                        ? AppBadgeVariant.outline
                        : AppBadgeVariant.warning,
                    child: Text(
                      MastermindLabels.sourceState(l10n, source.state),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
