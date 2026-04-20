import 'dart:ui';

import 'package:mobile/data/sources/supabase_client.dart';

String? currentCacheUserId() => maybeSupabase?.auth.currentUser?.id;

String currentCachePartition({String fallback = 'anonymous'}) =>
    currentCacheUserId() ?? fallback;

String userScopedCacheKey(
  String base, {
  String? userId,
  String separator = '::',
}) {
  final resolvedUserId = userId ?? currentCacheUserId() ?? 'anonymous';
  return '$resolvedUserId$separator$base';
}

String currentCacheLocaleTag() {
  final locale = PlatformDispatcher.instance.locale;
  final countryCode = locale.countryCode;
  if (countryCode == null || countryCode.isEmpty) {
    return locale.languageCode;
  }
  return '${locale.languageCode}-$countryCode';
}
