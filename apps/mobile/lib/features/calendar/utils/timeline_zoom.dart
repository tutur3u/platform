const calendarTimelineMinZoom = 0.65;
const calendarTimelineMaxZoom = 2.5;

double calendarTimelineZoom(Object? value) => value is num && value.isFinite
    ? value.toDouble().clamp(calendarTimelineMinZoom, calendarTimelineMaxZoom)
    : 1;

double calendarZoomOffset({
  required double anchorHours,
  required double hourHeight,
  required double focalY,
  required double maxExtent,
}) => (anchorHours * hourHeight - focalY).clamp(0, maxExtent);
