import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/calendar/utils/timeline_zoom.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showCalendarZoomSheet(
  BuildContext context, {
  required double zoom,
  required ValueChanged<double> onChanged,
}) => showAppSheet<void>(
  context: context,
  builder: (context) => _CalendarZoomControls(zoom: zoom, onChanged: onChanged),
);

class _CalendarZoomControls extends StatefulWidget {
  const _CalendarZoomControls({required this.zoom, required this.onChanged});
  final double zoom;
  final ValueChanged<double> onChanged;
  @override
  State<_CalendarZoomControls> createState() => _CalendarZoomControlsState();
}

class _CalendarZoomControlsState extends State<_CalendarZoomControls> {
  late double _zoom = calendarTimelineZoom(widget.zoom);
  void _change(double value) {
    setState(() => _zoom = calendarTimelineZoom(value));
    widget.onChanged(_zoom);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final percent = (_zoom * 100).round();
    final tokens = AppTokens.of(context);
    return AppSheetScaffold(
      title: l10n.calendarTimelineZoom,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Semantics(
            label: l10n.calendarTimelineZoom,
            value: '$percent%',
            child: Text(
              '$percent%',
              style: tokens.typography.x2Large.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.lg,
            runSpacing: AppSpacing.sm,
            children: [
              AppIconButton(
                tooltip: l10n.calendarZoomOut,
                onPressed: _zoom <= calendarTimelineMinZoom
                    ? null
                    : () => _change(_zoom / 1.2),
                icon: const Icon(LucideIcons.zoomOut),
              ),
              AppButton.outline(
                onPressed: _zoom == 1 ? null : () => _change(1),
                child: Text(l10n.calendarZoomReset),
              ),
              AppIconButton(
                tooltip: l10n.calendarZoomIn,
                onPressed: _zoom >= calendarTimelineMaxZoom
                    ? null
                    : () => _change(_zoom * 1.2),
                icon: const Icon(LucideIcons.zoomIn),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
