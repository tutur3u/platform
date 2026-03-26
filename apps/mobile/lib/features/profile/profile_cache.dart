const profileCacheTtl = Duration(minutes: 5);

bool isProfileCacheFresh(DateTime fetchedAt) {
  return DateTime.now().difference(fetchedAt) < profileCacheTtl;
}
