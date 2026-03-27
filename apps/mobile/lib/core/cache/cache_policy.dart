class CachePolicy {
  const CachePolicy({
    required this.staleAfter,
    required this.expireAfter,
    this.refreshOnResume = true,
    this.refreshOnReconnect = true,
    this.allowBackgroundRefresh = true,
  });

  final Duration staleAfter;
  final Duration expireAfter;
  final bool refreshOnResume;
  final bool refreshOnReconnect;
  final bool allowBackgroundRefresh;
}

class CachePolicies {
  const CachePolicies._();

  static const metadata = CachePolicy(
    staleAfter: Duration(minutes: 30),
    expireAfter: Duration(days: 7),
  );

  static const summary = CachePolicy(
    staleAfter: Duration(minutes: 2),
    expireAfter: Duration(days: 1),
  );

  static const moduleData = CachePolicy(
    staleAfter: Duration(minutes: 3),
    expireAfter: Duration(days: 1),
  );

  static const detail = CachePolicy(
    staleAfter: Duration(minutes: 5),
    expireAfter: Duration(days: 1),
  );
}
