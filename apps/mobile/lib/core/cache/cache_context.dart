import 'dart:ui';

import 'package:mobile/data/sources/supabase_client.dart';

String? currentCacheUserId() => maybeSupabase?.auth.currentUser?.id;

String currentCacheLocaleTag() {
  final locale = PlatformDispatcher.instance.locale;
  final countryCode = locale.countryCode;
  if (countryCode == null || countryCode.isEmpty) {
    return locale.languageCode;
  }
  return '${locale.languageCode}-$countryCode';
}
