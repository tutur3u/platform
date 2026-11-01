import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/config/consent_gate.dart';
import 'package:mobile/core/config/firebase_options_selector.dart';
import 'package:mobile/firebase_options_development.dart' as development;
import 'package:mobile/firebase_options_production.dart' as production;

void main() {
  test('release mode disables a requested QA override at compile time', () {
    const release = ConsentGate(qaRequested: true, releaseMode: true);
    expect(release.qaOverride, isFalse);
    expect(release.isEligible(AppFlavor.development), isFalse);
    expect(release.isEligible(AppFlavor.staging), isFalse);
    expect(release.isEligible(AppFlavor.production), isTrue);
  });

  test('QA gate preserves flavor Firebase options on iOS and Android', () {
    final qa = _gate(qaRequested: true, releaseMode: false);
    final normal = _gate(qaRequested: false, releaseMode: false);
    expect(normal.isEligible(AppFlavor.development), isFalse);
    expect(qa.isEligible(AppFlavor.development), isTrue);
    expect(qa.isEligible(AppFlavor.staging), isTrue);
    for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
      debugDefaultTargetPlatformOverride = platform;
      try {
        final options = firebaseOptionsForFlavor(AppFlavor.development);
        expect(options, development.DefaultFirebaseOptions.currentPlatform);
        expect(
          options.projectId,
          isNot(production.DefaultFirebaseOptions.currentPlatform.projectId),
        );
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    }
  });

  test('compile-time flag controls the actual shared policy', () {
    expect(
      consentGate.qaOverride,
      const bool.fromEnvironment('CONSENT_GATE_QA') && !kReleaseMode,
    );
  });
}

ConsentGate _gate({required bool qaRequested, required bool releaseMode}) =>
    ConsentGate(qaRequested: qaRequested, releaseMode: releaseMode);
