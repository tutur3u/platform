import 'dart:async';
import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_repository.dart';

/// The signed-in user's Mira AI data consent, cached from the server.
///
/// The answer belongs to one user: a different signed-in user reads as
/// unknown until the server answers for them. Unknown, including a failed
/// read, is never consent, and the next check asks the server again. A
/// server answer already held is kept through a failed refresh, because the
/// server still refuses a send it no longer allows.
class MiraAiConsentController extends ChangeNotifier {
  MiraAiConsentController({
    MiraAiConsentRepository? repository,
    String? Function()? currentUserId,
  }) : _repositoryOverride = repository,
       _currentUserId = currentUserId ?? currentCacheUserId;

  static final instance = MiraAiConsentController();

  final MiraAiConsentRepository? _repositoryOverride;
  late final MiraAiConsentRepository _repository =
      _repositoryOverride ?? MiraAiConsentRepository();
  final String? Function() _currentUserId;

  ({String userId, MiraAiConsent consent})? _cache;
  ({String userId, Future<MiraAiConsent?> read})? _reading;
  Future<bool>? _prompt;
  bool _busy = false;
  bool _failed = false;

  /// The server's answer for the signed-in user, or null while unknown.
  MiraAiConsent? get consent {
    final cache = _cache;
    final userId = _currentUserId();
    return cache != null && userId != null && cache.userId == userId
        ? cache.consent
        : null;
  }

  bool get known => consent != null;
  bool get granted => consent?.granted ?? false;

  /// A save is in flight.
  bool get busy => _busy;

  /// The last read or save failed.
  bool get failed => _failed;

  /// Asks the server for the current answer. Concurrent reads share one
  /// request. Returns the answer, or null when it could not be read.
  Future<MiraAiConsent?> refresh() {
    final userId = _currentUserId();
    if (userId == null) return Future.value();
    final reading = _reading;
    if (reading != null && reading.userId == userId) return reading.read;
    final read = _read(userId);
    _reading = (userId: userId, read: read);
    return read;
  }

  Future<MiraAiConsent?> _read(String userId) async {
    try {
      final answer = await _repository.fetch(userId);
      if (_currentUserId() != userId) return null;
      _cache = (userId: userId, consent: answer);
      _failed = false;
      return answer;
    } on Object catch (error) {
      log('Mira AI consent read failed: ${error.runtimeType}');
      if (_currentUserId() == userId) _failed = true;
      return null;
    } finally {
      if (_reading?.userId == userId) _reading = null;
      notifyListeners();
    }
  }

  /// The cached answer, read from the server first while it is unknown.
  Future<bool> ensureKnown() async {
    if (!known) await refresh();
    return granted;
  }

  /// Stores [granted] for the signed-in user. Revoking stops new sends at
  /// once, before the server confirms; allowing takes effect only after the
  /// server stored it. Returns whether the server stored the answer.
  Future<bool> setGranted({
    required bool granted,
    required MiraAiConsentSource source,
  }) async {
    final userId = _currentUserId();
    if (userId == null || _busy) return false;
    _busy = true;
    if (!granted) {
      _cache = (userId: userId, consent: MiraAiConsent.denied);
    }
    notifyListeners();
    try {
      final answer = await _repository.save(
        userId,
        granted: granted,
        source: source,
      );
      if (_currentUserId() != userId) return false;
      // A revoke stays revoked locally whatever the response says.
      _cache = (
        userId: userId,
        consent: granted ? answer : MiraAiConsent.denied,
      );
      _failed = false;
      return answer.granted == granted;
    } on Object catch (error) {
      log('Mira AI consent save failed: ${error.runtimeType}');
      if (_currentUserId() == userId) _failed = true;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// The server refused a send for missing consent: forget a cached grant.
  void consentRequired() {
    final userId = _currentUserId();
    if (userId == null) return;
    _cache = (userId: userId, consent: MiraAiConsent.denied);
    notifyListeners();
  }

  /// Runs one consent prompt at a time; a second caller waits on the first.
  Future<bool> prompt(Future<bool> Function() show) {
    final pending = _prompt;
    if (pending != null) return pending;
    final next = show().whenComplete(() => _prompt = null);
    _prompt = next;
    return next;
  }

  @visibleForTesting
  void debugSetConsent(String userId, MiraAiConsent consent) {
    _cache = (userId: userId, consent: consent);
    notifyListeners();
  }
}

/// The app's consent controller as a provided value for the pages that send
/// to Mira. A plain holder, because provider refuses a ChangeNotifier value.
class MiraAiConsentProvision {
  const MiraAiConsentProvision(this.controller);

  static final app = MiraAiConsentProvision(MiraAiConsentController.instance);

  final MiraAiConsentController controller;
}
