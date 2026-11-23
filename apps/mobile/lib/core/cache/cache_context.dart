import 'dart:ui';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:mobile/data/sources/supabase_client.dart';

/// Test-only cache owner, since tests cannot sign in through Supabase.
@visibleForTesting
String? Function()? debugCacheUserIdOverride;

String? currentCacheUserId() =>
    debugCacheUserIdOverride?.call() ?? maybeSupabase?.auth.currentUser?.id;

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
