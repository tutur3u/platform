import 'dart:async';
import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// How the first-run onboarding ended for one account on this device.
enum OnboardingOutcome {
  completed,
  skipped,

  /// The account was already on this device when the gate first ran, so it
  /// never sees the first-run flow (Settings can still replay it).
  existing;

  static OnboardingOutcome? parse(String? raw) {
    for (final value in values) {
      if (value.name == raw) return value;
    }
    return null;
  }
}

/// Decides whether an account still owes the first-run onboarding.
///
/// The flow runs once per account per device, after that account's first
/// successful sign-in on the device. Outcomes are keyed by user id, so a
/// second account added later gets its own run. The first time the gate
/// runs, every account already present (the signed-in one and the saved
/// accounts) is recorded as [OnboardingOutcome.existing], so an app update
/// never interrupts people who were already using the app.
///
/// A deep link (or notification tap) that arrives in this app session wins
/// over onboarding: [deferForSession] keeps the flow away until the next
/// launch, so the link opens where it points.
///
/// The router reads [isPending] synchronously. Until storage is loaded the
/// gate answers "not pending", so it never blocks app access; once loaded it
/// notifies and the router re-evaluates.
class OnboardingGate extends ChangeNotifier {
  OnboardingGate({Future<SharedPreferences> Function()? preferences})
    : _preferences = preferences ?? SharedPreferences.getInstance;

  static final instance = OnboardingGate();

  /// Written once, on the gate's first run on this device.
  static const baselineKey = 'onboarding-gate-baseline-v1';
  static const _outcomePrefix = 'onboarding-outcome:';

  static String outcomeKey(String userId) => '$_outcomePrefix$userId';

  final Future<SharedPreferences> Function() _preferences;
  SharedPreferences? _prefs;
  Future<void>? _loading;
  bool _deferred = false;

  bool get ready => _prefs != null;

  /// Whether a deep link has put onboarding off until the next launch.
  bool get deferred => _deferred;

  /// Loads storage once. [activeUserId] and [savedAccountIds] describe the
  /// device at the moment the gate first runs; they seed the baseline only
  /// on that first run. Never throws: a storage failure keeps the flow off.
  ///
  /// [loadStoredAccountIds] reads the device's saved accounts from local
  /// storage. The auth state's list is filled asynchronously, so on the first
  /// launch after an update it can still be empty when the gate primes.
  void prime({
    required String? activeUserId,
    required Iterable<String> savedAccountIds,
    Future<Iterable<String>> Function()? loadStoredAccountIds,
  }) {
    if (_prefs != null || _loading != null) return;
    final present = {?activeUserId, ...savedAccountIds};
    _loading = _load(present, loadStoredAccountIds);
    unawaited(_loading);
  }

  Future<void> _load(
    Set<String> present,
    Future<Iterable<String>> Function()? loadStoredAccountIds,
  ) async {
    try {
      final prefs = await _preferences();
      if (!prefs.containsKey(baselineKey)) {
        if (loadStoredAccountIds != null) {
          // A failed read must not mark the baseline as written.
          present.addAll(await loadStoredAccountIds());
        }
        for (final id in present) {
          if (prefs.getString(outcomeKey(id)) != null) continue;
          await prefs.setString(
            outcomeKey(id),
            OnboardingOutcome.existing.name,
          );
        }
        await prefs.setBool(baselineKey, true);
      }
      _prefs = prefs;
      notifyListeners();
    } on Object catch (error) {
      log('Onboarding gate could not load: ${error.runtimeType}');
    }
  }

  /// The stored outcome for [userId], or null when the flow is still owed.
  OnboardingOutcome? outcomeFor(String userId) =>
      OnboardingOutcome.parse(_prefs?.getString(outcomeKey(userId)));

  /// True when [userId] should be sent to the first-run flow now.
  bool isPending(String userId) =>
      ready && !_deferred && outcomeFor(userId) == null;

  /// Records how the flow ended for [userId]. Never throws.
  Future<void> record(String userId, OnboardingOutcome outcome) async {
    try {
      final prefs = _prefs ?? await _preferences();
      await prefs.setString(outcomeKey(userId), outcome.name);
      _prefs ??= prefs;
    } on Object catch (error) {
      log('Onboarding outcome not saved: ${error.runtimeType}');
    }
    notifyListeners();
  }

  /// Puts the flow off for the rest of this app session.
  void deferForSession() {
    if (_deferred) return;
    _deferred = true;
    notifyListeners();
  }

  @visibleForTesting
  void resetForTest() {
    _prefs = null;
    _loading = null;
    _deferred = false;
  }
}
