import 'dart:async';
import 'dart:developer';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Distinguish native plugin failures without reporting sensitive messages.
String mobileCrashSignature(Object error) {
  if (error is! PlatformException) return error.runtimeType.toString();
  final code = error.code;
  if (!RegExp(r'^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$').hasMatch(code)) {
    return 'PlatformException:unknown';
  }
  return 'PlatformException:$code';
}

/// Reports production failures without user content or room identifiers.
class MobileObservability {
  MobileObservability._();

  static final instance = MobileObservability._();

  static final _safeSource = RegExp(r'^[a-z][a-z0-9_]{0,39}$');
  final _nonFatalDeduplicator = BoundedFailureDeduplicator();
  OperationalErrorReporter? _operationalReporter;
  OperationalErrorReporter get operationalReporter => _operationalReporter ??=
      OperationalErrorReporter(sink: _recordOperational);
  bool _enabled = false;

  Future<void> initialize(AppFlavor flavor) async {
    final enabled = flavor == AppFlavor.production;
    await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(enabled);
    _enabled = enabled;
    try {
      final package = await PackageInfo.fromPlatform();
      _operationalReporter = OperationalErrorReporter(
        sink: _recordOperational,
        appVersion: package.version,
        appBuild: package.buildNumber,
      );
    } on Object catch (_) {
      // Release metadata may be unavailable; never use plugin error contents.
    }
    try {
      await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(enabled);
    } on Object catch (error) {
      log('Firebase Analytics setup failed: ${error.runtimeType}');
    }
  }

  bool recordFatal(String source, Object error, StackTrace? stack) {
    final code = _code(source);
    log('Mobile fatal error: $code (${error.runtimeType})', stackTrace: stack);
    if (!_enabled) return false;
    unawaited(_record(code, error, stack, fatal: true));
    return true;
  }

  void recordNonFatal(String source, Object error, StackTrace? stack) {
    final code = _code(source);
    if (!_enabled) return;
    final key = '$code:${mobileCrashSignature(error)}';
    if (!_nonFatalDeduplicator.admit(key)) return;
    unawaited(_record(code, error, stack, fatal: false));
  }

  void logMeetEvent(String event, {required String media}) {
    if (!_enabled) return;
    if (event != 'meet_media_published' && event != 'meet_media_received') {
      return;
    }
    final safeMedia = switch (media) {
      'audio' || 'video' || 'audio_video' => media,
      _ => 'unknown',
    };
    unawaited(
      FirebaseAnalytics.instance
          .logEvent(name: event, parameters: {'media': safeMedia})
          .catchError((Object _) {}),
    );
  }

  Future<void> _recordOperational(OperationalErrorEvent event) async {
    if (!_enabled) return;
    // The SDK replaces null/empty stacks with StackTrace.current. Supply one
    // fixed synthetic frame instead; no captured stack or payload reaches it.
    final stack = StackTrace.fromString(
      '#0 MobileOperationalFailure.report '
      '(package:mobile/core/observability/mobile_observability.dart:1:1)',
    );
    await FirebaseCrashlytics.instance.recordError(
      StateError('mobile_operational:${event.phase.name}:${event.kind.name}'),
      stack,
      reason: 'mobile_operational',
      information: event.fields.entries.map(
        (entry) => '${entry.key}=${entry.value}',
      ),
      printDetails: false,
    );
  }

  Future<void> _record(
    String code,
    Object error,
    StackTrace? stack, {
    required bool fatal,
  }) async {
    final type = mobileCrashSignature(error);
    try {
      // Preserve the original stack while excluding exception messages, which
      // can contain attachment names, message text, or session credentials.
      await FirebaseCrashlytics.instance.recordError(
        StateError('$code:$type'),
        stack,
        reason: code,
        fatal: fatal,
      );
    } on Object catch (reportError) {
      log('Crashlytics report failed: ${reportError.runtimeType}');
    }
    if (fatal) return;
    try {
      await FirebaseAnalytics.instance.logEvent(
        name: 'mobile_error',
        parameters: {'source': code, 'error_type': type},
      );
    } on Object catch (reportError) {
      log('Analytics report failed: ${reportError.runtimeType}');
    }
  }

  String _code(String source) =>
      _safeSource.hasMatch(source) ? source : 'unknown';
}
