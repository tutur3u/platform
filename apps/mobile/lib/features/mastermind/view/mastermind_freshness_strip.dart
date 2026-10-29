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
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One short line under the navbar, inside the scroll view so it scrolls away.
///
/// Data age is informational (publishing is manual at first); only a failed
/// refresh or a degraded source is a warning. The visible line is short
/// ("Published 4 h ago · 2 sources degraded"); the full sentence with the
/// absolute GMT+7 date and time is what screen readers announce. A warning
/// tints only the glyph and a leading bar, never the text, so the text keeps
/// its contrast in light mode.
///
/// Healthy and fresh data (published within five minutes, every source ok)
/// hides the strip unless [showWhenHealthy], which Home sets.
class MastermindFreshnessStrip extends StatelessWidget {
  const MastermindFreshnessStrip({
    required this.freshness,
    this.showWhenHealthy = false,
    super.key,
  });

  final MastermindFreshness freshness;
  final bool showWhenHealthy;

  /// The full sentence, announced by screen readers.
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
    return _withSources(l10n, base);
  }

  /// The visible line: an age or a short GMT+7 time, never a full date.
  String line(AppLocalizations l10n, String locale) {
    // Within a day the time alone is unambiguous; older data adds the day.
    final short = freshness.age < const Duration(hours: 20)
        ? Gmt7.time(freshness.time, locale)
        : '${Gmt7.day(freshness.time, locale)} '
              '${Gmt7.time(freshness.time, locale)}';
    final base = switch (freshness.kind) {
      MastermindFreshnessKind.updated => l10n.mastermindUpdatedAt(short),
      MastermindFreshnessKind.lastPublished => l10n.mastermindPublishedAgo(
        mastermindAgeText(l10n, freshness.age),
      ),
      MastermindFreshnessKind.offline => l10n.mastermindOfflineShowing(short),
      MastermindFreshnessKind.couldntRefresh =>
        l10n.mastermindCouldntRefreshShowing(short),
      MastermindFreshnessKind.updateApp => l10n.mastermindUpdateAppShowing(
        short,
      ),
      MastermindFreshnessKind.unreadable => l10n.mastermindCouldntReadShowing(
        short,
      ),
    };
    return _withSources(l10n, base);
  }

  String _withSources(AppLocalizations l10n, String base) =>
      freshness.degradedSources == 0
      ? base
      : '$base · ${l10n.mastermindSourcesDegraded(freshness.degradedSources)}';

  @override
  Widget build(BuildContext context) {
    final healthy =
        freshness.kind == MastermindFreshnessKind.updated &&
        !freshness.isWarning;
    if (healthy && !showWhenHealthy) return const SizedBox.shrink();
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final warning = freshness.isWarning;
    final tone = warning
        ? AppTone.warning.foreground(colors)
        : colors.mutedForeground;
    // Ellipsize at normal sizes; let large text wrap rather than truncate.
    final wraps = mastermindLargeText(context);
    // Only the degraded-sources case has somewhere to go.
    final onTap = freshness.degradedSources == 0
        ? null
        : () => unawaited(
            showMastermindSourcesSheet(context, sources: freshness.sources),
          );
    final content = Row(
      children: [
        Icon(
          warning ? AppIcons.warning : LucideIcons.clock,
          size: 14,
          color: tone,
        ),
        const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
        Expanded(
          child: Text(
            line(l10n, locale),
            maxLines: wraps ? null : 1,
            overflow: wraps ? null : TextOverflow.ellipsis,
            style: tokens.typography.small.copyWith(
              color: warning ? colors.foreground : colors.mutedForeground,
            ),
          ),
        ),
        if (onTap != null)
          Icon(AppIcons.forward, size: 16, color: colors.mutedForeground),
      ],
    );
    final strip = Container(
      constraints: BoxConstraints(
        minHeight: onTap == null ? 0 : AppInterfaceTokens.minTouchTarget,
      ),
      alignment: Alignment.centerLeft,
      padding: EdgeInsets.only(
        left: warning ? AppSpacing.sm : 0,
        top: AppSpacing.xs,
        bottom: AppSpacing.xs,
      ),
      decoration: warning
          ? BoxDecoration(
              border: Border(left: BorderSide(color: tone, width: 3)),
            )
          : null,
      child: content,
    );
    // A live region only while it is a warning, so a refresh that turns the
    // line into one is announced without the reader moving focus, but the
    // routine age ticks of a healthy "Updated" line are not.
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        container: true,
        liveRegion: warning,
        label: sentence(l10n, locale),
        button: onTap != null,
        onTap: onTap,
        child: ExcludeSemantics(
          child: onTap == null ? strip : InkWell(onTap: onTap, child: strip),
        ),
      ),
    );
  }
}
