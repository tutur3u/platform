import 'package:flutter/foundation.dart';
import 'package:mobile/core/config/app_flavor.dart';

/// Compile-time QA policy; never changes the app flavor or Firebase project.
class ConsentGate {
  const ConsentGate({
    bool qaRequested = const bool.fromEnvironment('CONSENT_GATE_QA'),
    bool releaseMode = kReleaseMode,
  }) : qaOverride = qaRequested && !releaseMode;

  final bool qaOverride;

  bool isEligible(AppFlavor flavor) =>
      flavor == AppFlavor.production || qaOverride;
}

const consentGate = ConsentGate();
