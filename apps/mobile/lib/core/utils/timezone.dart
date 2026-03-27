import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter_timezone/flutter_timezone.dart';

Future<String>? _timezoneIdentifierFuture;

Future<String> getCurrentTimezoneIdentifier() {
  final inFlightOrCached = _timezoneIdentifierFuture;
  if (inFlightOrCached != null) {
    return inFlightOrCached;
  }

  final future = _loadCurrentTimezoneIdentifier().then((resolved) {
    if (!resolved.shouldCache) {
      _timezoneIdentifierFuture = null;
    }
    return resolved.identifier;
  });

  _timezoneIdentifierFuture = future;
  return future;
}

bool isLikelyIanaTimezoneIdentifier(String value) {
  return value.contains('/');
}

class _ResolvedTimezoneIdentifier {
  const _ResolvedTimezoneIdentifier(
    this.identifier, {
    required this.shouldCache,
  });

  final String identifier;
  final bool shouldCache;
}

Future<_ResolvedTimezoneIdentifier> _loadCurrentTimezoneIdentifier() async {
  try {
    final timezone = await FlutterTimezone.getLocalTimezone();
    final identifier = timezone.identifier.trim();
    if (identifier.isNotEmpty) {
      return _ResolvedTimezoneIdentifier(identifier, shouldCache: true);
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
    return _ResolvedTimezoneIdentifier(fallbackIdentifier, shouldCache: true);
  }

  return const _ResolvedTimezoneIdentifier('UTC', shouldCache: false);
}
