import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_meter.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/insights/pacing_glyph.dart';
import 'package:mobile/features/mastermind/view/insights/usage_chart_panel.dart';
import 'package:mobile/l10n/l10n.dart';

/// One account pool: a single pacing verdict with the burn behind it, then a
/// meter for each budget window, then the pool's own chart. Never stacked or
/// summed with another pool. The label is shown verbatim.
class UsagePoolCard extends StatefulWidget {
  const UsagePoolCard({required this.pool, required this.chart, super.key});

  final UsagePool pool;
  final UsageChartSpec? chart;

  @override
  State<UsagePoolCard> createState() => _UsagePoolCardState();
}

class _UsagePoolCardState extends State<UsagePoolCard> {
  bool _note = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pool = widget.pool;
    final chart = widget.chart;
    final burn = _burnLine(l10n, pool);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: pool.label,
          children: [
            AppGroupedRow(
              title: PacingGlyph(pacing: pool.verdict),
              subtitle: burn == null ? null : Text(burn),
              trailing: Semantics(
                expanded: _note,
                child: AppIconButton(
                  tooltip: l10n.mastermindReservePacing,
                  icon: const Icon(AppIcons.info),
                  onPressed: () => setState(() => _note = !_note),
                ),
              ),
            ),
            if (_note)
              AppGroupedRow(
                title: Text(l10n.mastermindReservePacing),
                subtitle: Text(l10n.mastermindReservePacingInfo),
              ),
            _WindowRow(
              label: l10n.mastermindUsageSessionLeft,
              window: pool.latest.session,
              at: pool.latest.t,
            ),
            _WindowRow(
              label: l10n.mastermindUsageWeeklyLeft,
              window: pool.latest.weekly,
              at: pool.latest.t,
            ),
          ],
        ),
        if (chart != null) UsageChartPanel(spec: chart),
      ],
    );
  }

  /// "Burn rate 4.2 pp/h · Projected at reset +12 pp" for the window the
  /// verdict comes from (the session when there is none). A zero burn next to
  /// SHORT reads "Burn not measured yet".
  static String? _burnLine(AppLocalizations l10n, UsagePool pool) {
    final window = pool.verdictWindow ?? pool.latest.session;
    final burn = usageBurnShown(window);
    final unmeasured = burn == null && window.burnPercentPerHour != null;
    final projected = window.projectedRemainingAtReset;
    final parts = [
      if (unmeasured)
        l10n.mastermindUsageBurnNotMeasured
      else if (burn != null)
        _line(
          l10n.mastermindChartBurn,
          l10n.mastermindUnitPpPerHour(usageNumber(burn)),
        ),
      if (projected != null)
        _line(
          l10n.mastermindChartProjection,
          l10n.mastermindUnitPp(_signed(projected)),
        ),
    ];
    return parts.isEmpty ? null : parts.join(' · ');
  }

  static String _line(String label, String value) => '$label $value';

  static String _signed(double value) =>
      '${value >= 0 ? '+' : ''}${usageNumber(value)}';
}

/// "Session left  ███▁▁▁  28%" with when it resets. A window the hub did not
/// read shows a dash and its reason (for example "Not connected"), never 0.
class _WindowRow extends StatelessWidget {
  const _WindowRow({
    required this.label,
    required this.window,
    required this.at,
  });

  final String label;
  final UsageWindow window;

  /// When this reading was taken, so a reset on the same day reads as a time.
  final DateTime at;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final remaining = window.remainingPercent;
    final resets = window.resetsAt;
    final reason =
        window.fields['remaining_percent']?.reason(l10n) ??
        l10n.mastermindNotPublished;
    final percent = remaining == null
        ? null
        : l10n.mastermindUnitPercent(usageNumber(remaining));
    return AppGroupedRow(
      title: Text(label),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (remaining == null)
            Text(reason)
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: ExcludeSemantics(
                child: AppMeter(
                  value: remaining / 100,
                  tone: _tone(window.pacing),
                ),
              ),
            ),
          if (resets != null)
            Text(l10n.mastermindResetsAt(_when(l10n, resets))),
        ],
      ),
      // The dash is decoration; the reason under the label is what is read.
      trailing: ExcludeSemantics(
        excluding: percent == null,
        child: Text(
          percent ?? '—',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }

  /// The time alone on the reading's GMT+7 day, the day and time otherwise.
  String _when(AppLocalizations l10n, DateTime resets) {
    final locale = l10n.localeName;
    final time = Gmt7.time(resets, locale);
    return Gmt7.date(resets, locale) == Gmt7.date(at, locale)
        ? time
        : '${Gmt7.day(resets, locale)} $time';
  }

  static AppTone _tone(Pacing? pacing) => switch (pacing) {
    Pacing.short => AppTone.destructive,
    Pacing.ok => AppTone.success,
    Pacing.surplus => AppTone.info,
    null => AppTone.neutral,
  };
}
