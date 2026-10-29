import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// One short line under the navbar, inside the scroll view so it scrolls away.
///
/// Data age is informational (publishing is manual at first); only a failed
/// refresh or a degraded source is a warning. The visible line is short
/// ("Published 4h · 2 sources degraded"), the time a [MastermindTimeLabel]
/// whose long press shows the absolute time in the user's zone; the full
/// sentence with the spoken age and absolute time is what screen readers
/// announce. A warning tints only the glyph and a leading bar, never the text,
/// so the text keeps its contrast in light mode.
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

  /// The full sentence, announced by screen readers: the spoken age and the
  /// absolute time in [zone], as of [now].
  String sentence(
    AppLocalizations l10n,
    String locale, {
    required DateTime now,
    String zone = mastermindDefaultTimeZone,
  }) => _withSources(
    l10n,
    line(
      l10n,
      mastermindSpokenTime(
        l10n,
        freshness.time,
        now: now,
        zone: zone,
        locale: locale,
      ),
    ),
  );

  /// The words around [time] for this kind of line: "Updated {time}",
  /// "Published {time}", "Offline, showing {time}".
  String line(AppLocalizations l10n, String time) => switch (freshness.kind) {
    MastermindFreshnessKind.updated => l10n.mastermindUpdatedAt(time),
    MastermindFreshnessKind.lastPublished => l10n.mastermindPublishedAgo(time),
    MastermindFreshnessKind.offline => l10n.mastermindOfflineShowing(time),
    MastermindFreshnessKind.couldntRefresh =>
      l10n.mastermindCouldntRefreshShowing(time),
    MastermindFreshnessKind.updateApp => l10n.mastermindUpdateAppShowing(time),
    MastermindFreshnessKind.unreadable => l10n.mastermindCouldntReadShowing(
      time,
    ),
  };

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
    final tone = AppTone.warning.foreground(colors);
    final textStyle = tokens.typography.small.copyWith(
      color: warning ? colors.foreground : colors.mutedForeground,
    );
    // Ellipsize at normal sizes; let large text wrap rather than truncate.
    final wraps = mastermindLargeText(context);
    final degraded = freshness.degradedSources;
    // Only the degraded-sources case has somewhere to go.
    final onTap = freshness.degradedSources == 0
        ? null
        : () => unawaited(
            showMastermindSourcesSheet(context, sources: freshness.sources),
          );
    final content = Row(
      children: [
        if (warning) ...[
          Icon(AppIcons.warning, size: 14, color: tone),
          const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
        ],
        Expanded(
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.xs,
            children: [
              MastermindTimeLabel(
                freshness.time,
                sentence: (time) => line(l10n, time),
                maxLines: wraps ? null : 1,
                overflow: wraps ? null : TextOverflow.ellipsis,
                style: textStyle,
              ),
              if (degraded > 0)
                Text(
                  '· ${l10n.mastermindSourcesDegraded(degraded)}',
                  style: textStyle,
                ),
            ],
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
      // The spoken age is recomputed on every clock tick, not cached.
      child: MastermindClockBuilder(
        builder: (context, now) => Semantics(
          container: true,
          liveRegion: warning,
          label: sentence(
            l10n,
            locale,
            now: now,
            zone: mastermindTimeZoneOf(context),
          ),
          button: onTap != null,
          onTap: onTap,
          child: ExcludeSemantics(
            child: onTap == null ? strip : InkWell(onTap: onTap, child: strip),
          ),
        ),
      ),
    );
  }
}
