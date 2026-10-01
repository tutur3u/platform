import 'dart:developer' as developer;

import 'package:flutter_timezone/flutter_timezone.dart';

Future<String>? _timezoneIdentifierFuture;

Future<String> getCurrentTimezoneIdentifier() {
  final inFlight = _timezoneIdentifierFuture;
  if (inFlight != null) {
    return inFlight;
  }

  // Deduplicate concurrent reads, but revalidate after each completed lookup.
  // A device can change zones while this process remains alive.
  final future = _loadCurrentTimezoneIdentifier().whenComplete(
    () => _timezoneIdentifierFuture = null,
  );

  _timezoneIdentifierFuture = future;
  return future;
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

/// Settings must distinguish a verified UTC device from an unknown fallback.
/// Other existing consumers retain their compatibility fallback above.
Future<String> getVerifiedDeviceTimezoneIdentifier() async {
  final timezone = await FlutterTimezone.getLocalTimezone();
  final identifier = timezone.identifier.trim();
  if (identifier.isEmpty) {
    throw Exception('Native device timezone is unavailable.');
  }
  return identifier;
}
