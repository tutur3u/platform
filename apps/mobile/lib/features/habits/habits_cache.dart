const habitsCacheTtl = Duration(minutes: 2);

bool isHabitsCacheFresh(DateTime fetchedAt) {
  return DateTime.now().difference(fetchedAt) < habitsCacheTtl;
}
