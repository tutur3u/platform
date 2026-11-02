import 'package:flutter/foundation.dart';

/// Temporary build flags until the mobile capability provider is confirmed.
/// Missing flags always fail closed. Download and existing replay stay enabled.
abstract final class OfflineEditFlags {
  @visibleForTesting
  static Map<String, bool>? debugOverride;

  static bool enabled(String feature) =>
      debugOverride?[feature] ??
      switch (feature) {
        'finance' => const bool.fromEnvironment('offline_edit_finance'),
        'tasks' => const bool.fromEnvironment('offline_edit_tasks'),
        'calendar' => const bool.fromEnvironment('offline_edit_calendar'),
        _ => false,
      };
}
