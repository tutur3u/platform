import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter_timezone/flutter_timezone.dart';

Future<String>? _timezoneIdentifierFuture;

Future<String> getCurrentTimezoneIdentifier() {
  return _timezoneIdentifierFuture ??= _loadCurrentTimezoneIdentifier();
}

bool isLikelyIanaTimezoneIdentifier(String value) {
  return value.contains('/');
}

Future<String> _loadCurrentTimezoneIdentifier() async {
  try {
    final timezone = await FlutterTimezone.getLocalTimezone();
    final identifier = timezone.identifier.trim();
    if (identifier.isNotEmpty) {
      return identifier;
    }
  } on Object catch (error, stackTrace) {
    developer.log(
      'Failed to resolve native timezone identifier; falling back.',
      name: 'mobile.timezone',
      error: error,
      stackTrace: stackTrace,
    );
  }

  final fallbackIdentifier = DateTime.now().timeZoneName.trim();
  if (isLikelyIanaTimezoneIdentifier(fallbackIdentifier)) {
    return fallbackIdentifier;
  }

  return 'UTC';
}
