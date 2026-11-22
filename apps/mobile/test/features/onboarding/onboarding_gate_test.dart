import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Regression coverage for apps/docs/platform/features/mobile-onboarding.mdx:
/// the first-run flow is owed once per account per device, and accounts
/// already on the device when the gate first runs never see it.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<OnboardingGate> primed({
    String? active,
    List<String> saved = const [],
  }) async {
    final gate = OnboardingGate()
      ..prime(activeUserId: active, savedAccountIds: saved);
    await pumpEventQueue();
    expect(gate.ready, isTrue);
    return gate;
  }

  test('answers not pending until storage is loaded', () {
    final gate = OnboardingGate();
    expect(gate.isPending('new'), isFalse);
  });

  test(
    'a fresh device owes the flow to the first account to sign in',
    () async {
      final gate = await primed();
      expect(gate.isPending('lan'), isTrue);
    },
  );

  test('accounts present on the first run are recorded as existing', () async {
    final gate = await primed(active: 'lan', saved: ['minh']);
    expect(gate.isPending('lan'), isFalse);
    expect(gate.isPending('minh'), isFalse);
    expect(gate.outcomeFor('lan'), OnboardingOutcome.existing);
    // An account added later still gets its own run.
    expect(gate.isPending('second'), isTrue);
  });

  test('the baseline is taken only once per device', () async {
    await primed();
    final later = await primed(active: 'signed-in-later');
    expect(later.isPending('signed-in-later'), isTrue);
  });

  test('completion and skip are keyed per user id', () async {
    final gate = await primed();
    await gate.record('lan', OnboardingOutcome.completed);
    await gate.record('minh', OnboardingOutcome.skipped);
    expect(gate.isPending('lan'), isFalse);
    expect(gate.isPending('minh'), isFalse);
    expect(gate.isPending('third'), isTrue);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(OnboardingGate.outcomeKey('lan')), 'completed');
    expect(prefs.getString(OnboardingGate.outcomeKey('minh')), 'skipped');
  });

  test('a deep link defers the flow for the session only', () async {
    final gate = await primed();
    var notified = 0;
    gate
      ..addListener(() => notified++)
      ..deferForSession();
    expect(gate.isPending('lan'), isFalse);
    expect(notified, 1);
    expect(gate.outcomeFor('lan'), isNull);
    final nextLaunch = await primed();
    expect(nextLaunch.isPending('lan'), isTrue);
  });
}
