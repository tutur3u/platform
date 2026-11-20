/// Google Maps search for a meeting place.
///
/// Returns null when [location] is blank. The caller opens the result with
/// the mobile link launcher so browser preference and URL checks stay shared.
Uri? calendarLocationMapUri(String? location) {
  final query = location?.trim();
  if (query == null || query.isEmpty) return null;
  return Uri.https('www.google.com', '/maps/search/', {
    'api': '1',
    'query': query,
  });
}
