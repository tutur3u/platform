import 'dart:async';
import 'dart:developer';
import 'dart:io' show Platform;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/config/consent_gate.dart';
import 'package:mobile/core/observability/android_analytics_collection.dart';
import 'package:mobile/core/observability/mobile_diagnostics.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Distinguish native plugin failures without reporting sensitive messages.
String mobileCrashSignature(Object error) {
  if (error is PlatformException) {
    return switch (error.code) {
      'webview_create_failed' ||
      'permission_denied' ||
      'not_available' => 'PlatformException:${error.code}',
      _ => 'PlatformException:unknown',
    };
  }
  final type = error.runtimeType.toString();
  return RegExp(r'^[a-zA-Z][a-zA-Z0-9_]{0,63}$').hasMatch(type)
      ? type
      : 'UnknownError';
}

/// Native collection switches, replaceable so consent paths are testable.
class TelemetryCollectionControls {
  const TelemetryCollectionControls();

  Future<void> setCrashCollection({required bool enabled}) =>
      FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(enabled);

  Future<void> setAnalyticsCollection({required bool enabled}) async {
    if (Platform.isAndroid) {
      await AndroidAnalyticsCollection.instance.apply(enabled: enabled);
      return;
    }
    if (Platform.isIOS) {
      await const MethodChannel(
        'mobile/firebase_startup',
      ).invokeMethod<void>('setAnalyticsCollectionEnabled', enabled);
      return;
    }
    await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(enabled);
  }

  Future<void> deleteUnsentCrashReports() =>
      FirebaseCrashlytics.instance.deleteUnsentReports();
}

/// Reports production failures without user content or room identifiers.
class MobileObservability {
  MobileObservability._() : _controls = const TelemetryCollectionControls();

  @visibleForTesting
  MobileObservability.withControls(this._controls);

  static final instance = MobileObservability._();

  static final _safeSource = RegExp(r'^[a-z][a-z0-9_]{0,39}$');
  final _nonFatalDeduplicator = BoundedFailureDeduplicator();
  OperationalErrorReporter? _operationalReporter;
  OperationalErrorReporter get operationalReporter => _operationalReporter ??=
      OperationalErrorReporter(sink: _recordOperational);
  final TelemetryCollectionControls _controls;
  bool _enabled = false;
  final _networkDeduplicator = BoundedFailureDeduplicator();
  int _reportedNetworkFailures = 0;
  DateTime? _lastManualReport;
  bool _sendingDiagnostics = false;

  bool get enabled => _enabled;

  Future<void> initialize(
    AppFlavor flavor, {
    required bool collectionEnabled,
  }) async {
    final enabled = consentGate.isEligible(flavor) && collectionEnabled;
    _enabled = false;
    // Package metadata is not telemetry and never throws, so it overlaps the
    // collection switches. Consent was already read by the caller; collection
    // stays off until unsent reports are deleted (below, strictly after the
    // switches settle).
    final reporter = _loadOperationalReporter();
    await Future.wait([
      _controls.setCrashCollection(enabled: enabled),
      _controls.setAnalyticsCollection(enabled: enabled),
    ]);
    if (!enabled) {
      // Native startup holds reports until Dart reads consent. Without
      // consent, crashes recorded meanwhile must never upload later.
      try {
        await _controls.deleteUnsentCrashReports();
      } on Object catch (error) {
        log('Unsent crash report deletion failed: ${error.runtimeType}');
      }
    }
    _enabled = enabled;
    if (identical(this, instance)) {
      MobileDiagnostics.instance.onFailedRequest = recordNetworkFailure;
    }
    await reporter;
  }

  Future<void> _loadOperationalReporter() async {
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
  }

  void recordFirstFrame(Duration elapsed) {
    final slow = elapsed >= const Duration(seconds: 5);
    MobileDiagnostics.instance.recordSignal(
      slow
          ? MobileDiagnosticSignal.slowFirstFrame
          : MobileDiagnosticSignal.firstFrame,
    );
    if (!_enabled || !slow) return;
    unawaited(
      _reportFixed('mobile_slow_first_frame', [
        'latency_bucket=${elapsed.inSeconds < 10 ? '5_to_9s' : '10s_plus'}',
      ]).catchError((Object _) {}),
    );
  }

  void recordNetworkFailure(MobileNetworkEvent event) {
    if (!_enabled || _reportedNetworkFailures >= 6) return;
    final status = event.status;
    final signature = '${event.method}:${event.host}:${event.route}:$status';
    if (!_networkDeduplicator.admit(signature)) return;
    _reportedNetworkFailures++;
    unawaited(
      _reportFixed('mobile_http_failure:$signature', [
        for (final field in event.toJson().entries)
          '${field.key}=${field.value}',
      ]).catchError((Object _) {}),
    );
  }

  Future<bool> sendDiagnostics() async {
    final lastReport = _lastManualReport;
    if (!_enabled ||
        _sendingDiagnostics ||
        (lastReport != null &&
            DateTime.now().difference(lastReport) <
                const Duration(minutes: 1))) {
      return false;
    }
    _sendingDiagnostics = true;
    try {
      await _reportFixed('mobile_diagnostics', [
        MobileDiagnostics.instance.export(limit: 10),
      ]);
      _lastManualReport = DateTime.now();
      return true;
    } finally {
      _sendingDiagnostics = false;
    }
  }

  Future<void> _reportFixed(String code, Iterable<String> information) async {
    if (!_enabled) return;
    await FirebaseCrashlytics.instance.recordError(
      StateError(code),
      _syntheticStack,
      reason: code,
      information: information,
      printDetails: false,
    );
  }

  bool recordFatal(String source, Object error, StackTrace? stack) {
    final code = _code(source);
    MobileDiagnostics.instance.recordSignal(MobileDiagnosticSignal.dartError);
    log('Mobile fatal error: $code (${mobileCrashSignature(error)})');
    if (!_enabled) return false;
    unawaited(_record(code, error, stack, fatal: true));
    return true;
  }

  void recordNonFatal(String source, Object error, StackTrace? stack) {
    MobileDiagnostics.instance.recordSignal(MobileDiagnosticSignal.dartError);
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
      // Remove text outside the app and framework source frames.
      await FirebaseCrashlytics.instance.recordError(
        StateError('$code:$type'),
        _redactStack(stack),
        reason: code,
        fatal: fatal,
        printDetails: false,
      );
    } on Object catch (reportError) {
      log('Crashlytics report failed: ${reportError.runtimeType}');
    }
    if (fatal || !_enabled) return;
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

final _syntheticStack = StackTrace.fromString(
  '#0 MobileObservability.report '
  '(package:mobile/core/observability/mobile_observability.dart:1:1)',
);
final _safeFrame = RegExp(
  r'^#\d+ +([a-zA-Z0-9_$.<> ]{1,100}) '
  r'\((package:(?:mobile|flutter)/[a-zA-Z0-9_/]+\.dart:\d{1,6}:\d{1,5})\)$',
);

StackTrace _redactStack(StackTrace? stack) {
  final frames = <String>[];
  for (final line in (stack?.toString() ?? '').split('\n').take(40)) {
    final match = _safeFrame.firstMatch(line.trimRight());
    if (match == null) continue;
    frames.add('#${frames.length} ${match.group(1)} (${match.group(2)})');
  }
  return frames.isEmpty
      ? _syntheticStack
      : StackTrace.fromString(frames.join('\n'));
}
