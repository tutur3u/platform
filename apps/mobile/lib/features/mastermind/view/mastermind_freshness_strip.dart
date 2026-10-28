import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// One line under the navbar, inside the scroll view so it scrolls away.
///
/// Data age is informational (publishing is manual at first); only a failed
/// refresh or a degraded source is a warning. Times are absolute GMT+7.
class MastermindFreshnessStrip extends StatelessWidget {
  const MastermindFreshnessStrip({required this.freshness, super.key});

  final MastermindFreshness freshness;

  /// The full sentence, also announced by screen readers.
  String sentence(AppLocalizations l10n, String locale) {
    final time = Gmt7.dateTime(freshness.time, locale);
    final base = switch (freshness.kind) {
      MastermindFreshnessKind.updated => l10n.mastermindUpdatedAt(time),
      MastermindFreshnessKind.lastPublished => l10n.mastermindLastPublished(
        mastermindAgeText(l10n, freshness.age),
        time,
      ),
      MastermindFreshnessKind.offline => l10n.mastermindOfflineShowing(time),
      MastermindFreshnessKind.couldntRefresh =>
        l10n.mastermindCouldntRefreshShowing(time),
      MastermindFreshnessKind.updateApp => l10n.mastermindUpdateAppShowing(
        time,
      ),
      MastermindFreshnessKind.unreadable => l10n.mastermindCouldntReadShowing(
        time,
      ),
    };
    if (freshness.degradedSources == 0) return base;
    return '$base · '
        '${l10n.mastermindSourcesDegraded(freshness.degradedSources)}';
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final warning = freshness.isWarning;
    final text = sentence(
      context.l10n,
      Localizations.localeOf(context).toString(),
    );
    final color = warning
        ? AppTone.warning.foreground(colors)
        : colors.mutedForeground;
    // Only the degraded-sources case has somewhere to go.
    final onTap = freshness.degradedSources == 0
        ? null
        : () => unawaited(
            showMastermindSourcesSheet(context, sources: freshness.sources),
          );
    final line = Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              warning ? AppIcons.warning : LucideIcons.clock,
              size: 14,
              color: color,
            ),
          ),
          const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
          Expanded(
            child: Text(
              text,
              style: tokens.typography.small.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
    // A live region only while it is a warning, so a refresh that turns the
    // line into one is announced without the reader moving focus, but the
    // routine age ticks of a healthy "Updated" line are not.
    return Semantics(
      container: true,
      liveRegion: warning,
      label: text,
      button: onTap != null,
      onTap: onTap,
      child: ExcludeSemantics(
        child: onTap == null
            ? line
            : InkWell(
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: AppInterfaceTokens.minTouchTarget,
                  ),
                  child: Align(alignment: Alignment.centerLeft, child: line),
                ),
              ),
      ),
    );
  }
}
