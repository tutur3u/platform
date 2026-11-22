import 'dart:io' show Platform;

import 'package:mobile/core/config/api_origins.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/config/env.dart';

class ApiConfig {
  const ApiConfig._();

  static ApiOrigins _origins = _originsFor(AppFlavor.development);

  static void configure(AppFlavor flavor) {
    _origins = _originsFor(flavor);
  }

  static ApiOrigins _originsFor(AppFlavor flavor) => ApiOrigins.forFlavor(
    flavor,
    platformOverride: Env.apiBaseUrl,
    financeOverride: Env.financeApiBaseUrl,
    inventoryOverride: Env.inventoryApiBaseUrl,
    tasksOverride: Env.tasksApiBaseUrl,
    contactsOverride: Env.contactsApiBaseUrl,
    calendarOverride: Env.calendarApiBaseUrl,
    teachOverride: Env.teachApiBaseUrl,
    trackOverride: Env.trackApiBaseUrl,
    infrastructureOverride: Env.infrastructureApiBaseUrl,
    mailOverride: Env.mailApiBaseUrl,
  );

  static AppFlavor get flavor => _origins.flavor;

  /// Display the origin without configured credentials, paths, or queries.
  static Map<String, String> get diagnosticOrigins {
    return {
      for (final origin in ApiOrigin.values)
        origin.name: _diagnosticOrigin(_origins.urlFor(origin)),
    };
  }

  static String _diagnosticOrigin(String url) {
    final uri = Uri.parse(_forDevice(url));
    return uri.host.isNotEmpty &&
            (uri.scheme == 'http' || uri.scheme == 'https')
        ? uri.origin
        : '—';
  }

  /// Base URL with Android emulator localhost rewriting.
  static String get baseUrl {
    return _forDevice(_origins.urlFor(ApiOrigin.platform));
  }

  static String get tasksBaseUrl =>
      _forDevice(_origins.urlFor(ApiOrigin.tasks));

  static String baseUrlForPath(String path) =>
      _forDevice(_origins.baseUrlForPath(path));

  static String _forDevice(String url) {
    if (Platform.isAndroid && url.contains('localhost')) {
      return url.replaceAll('localhost', '10.0.2.2');
    }
    return url;
  }
}
