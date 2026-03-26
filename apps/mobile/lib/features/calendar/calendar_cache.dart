const calendarCacheTtl = Duration(minutes: 2);

bool isCalendarCacheFresh(DateTime fetchedAt) {
  return DateTime.now().difference(fetchedAt) < calendarCacheTtl;
}
