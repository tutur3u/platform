import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-wide explicit consent takes precedence over the device region.
class TelemetryPreference extends ChangeNotifier {
  TelemetryPreference({required this.countryCode});

  static final instance = TelemetryPreference(countryCode: null);
  static const preferenceKey = 'share-analytics-and-crash-reports';
  static const privateRegions = {
    'AT',
    'BE',
    'BG',
    'HR',
    'CY',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IE',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'PL',
    'PT',
    'RO',
    'SK',
    'SI',
    'ES',
    'SE',
    'IS',
    'LI',
    'NO',
    'CH',
    'GB',
  };

  final String? countryCode;
  bool enabled = false;
  bool ready = false;
  bool busy = false;
  late Future<void> Function({required bool enabled}) _apply;

  static bool defaultEnabled(String? country) =>
      country != null &&
      country.isNotEmpty &&
      !privateRegions.contains(country.toUpperCase());

  Future<void> initialize({
    required Future<void> Function({required bool enabled}) apply,
    String? deviceCountryCode,
    Future<bool?> Function()? read,
  }) async {
    final saved = await (read?.call() ?? _read());
    enabled = saved ?? defaultEnabled(countryCode ?? deviceCountryCode);
    _apply = apply;
    await apply(enabled: enabled);
    ready = true;
    notifyListeners();
  }

  Future<bool?> _read() async =>
      (await SharedPreferences.getInstance()).getBool(preferenceKey);

  Future<void> setEnabled({required bool value}) async {
    if (!ready || busy) return;
    busy = true;
    notifyListeners();
    try {
      // Revoke collection before waiting for disk. Enabling requires a durable
      // choice first, so a failed write cannot turn collection on.
      if (!value) {
        enabled = false;
        await _apply(enabled: false);
      }
      final prefs = await SharedPreferences.getInstance();
      if (!await prefs.setBool(preferenceKey, value)) {
        throw StateError('Telemetry preference could not be saved');
      }
      if (value) await _apply(enabled: true);
      enabled = value;
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
