import 'package:flutter/material.dart';
import 'package:mobile/features/calendar/utils/timeline_zoom.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showCalendarZoomSheet(
  BuildContext context, {
  required double zoom,
  required ValueChanged<double> onChanged,
}) => showModalBottomSheet<void>(
  context: context,
  showDragHandle: true,
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
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.calendarTimelineZoom,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 16),
            Semantics(
              label: l10n.calendarTimelineZoom,
              value: '$percent%',
              child: Text('$percent%'),
            ),
            const SizedBox(height: 8),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              children: [
                IconButton(
                  constraints: const BoxConstraints(
                    minWidth: 48,
                    minHeight: 48,
                  ),
                  tooltip: l10n.calendarZoomOut,
                  onPressed: _zoom <= calendarTimelineMinZoom
                      ? null
                      : () => _change(_zoom / 1.2),
                  icon: const Icon(Icons.zoom_out),
                ),
                TextButton(
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                  onPressed: _zoom == 1 ? null : () => _change(1),
                  child: Text(l10n.calendarZoomReset),
                ),
                IconButton(
                  constraints: const BoxConstraints(
                    minWidth: 48,
                    minHeight: 48,
                  ),
                  tooltip: l10n.calendarZoomIn,
                  onPressed: _zoom >= calendarTimelineMaxZoom
                      ? null
                      : () => _change(_zoom * 1.2),
                  icon: const Icon(Icons.zoom_in),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
