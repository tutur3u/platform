import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Result of a fenced preference write.
enum PreferenceWriteOutcome {
  /// The fence rejected the write before dispatch; nothing changed.
  skipped,

  /// The platform store saved the value, and when the write returned it was
  /// still the newest saved choice.
  saved,

  /// The platform store saved the value, but a newer choice was saved too;
  /// the newer choice stands and this one must not be published.
  superseded,

  /// The platform store reported failure or threw.
  failed,
}

/// Orders overlapping writes of one preference key.
///
/// SharedPreferences updates its in-process cache synchronously at dispatch
/// and completes the platform write later, so overlapping writes can be
/// stored, and complete, out of order. Writes never wait on each other.
/// Instead, one ledger per preference store records a sequence per dispatch,
/// the newest saved *choice* (a caller's value, not a repair), and the newest
/// stored write. Repairs are dispatched through the same ledger, so a pending
/// repair keeps it busy and is ordered against newer choices.
///
/// When no write is outstanding, the key is settled: if a write was stored
/// after a newer one, or the cache no longer holds the newest choice (a newer
/// write failed), the newest choice is written again. A repair triggers
/// another only if, meanwhile, something was again stored out of order or
/// the cache changed, so settling is bounded by the overlapping writes. A
/// repair that fails is reported and not retried; the next write settles
/// the key again.
///
/// A caller's outcome is decided when its write returns, after settling: it
/// is [PreferenceWriteOutcome.saved] only if it is still the newest saved
/// choice, so a stale completion is never published over a newer choice.
class PreferenceWriteLedger {
  PreferenceWriteLedger._(this._prefs, this._key)
    : _choice = _prefs.getString(_key);

  /// The ledger for [key] in [prefs]; a new store instance starts a new one.
  factory PreferenceWriteLedger.of(SharedPreferences prefs, String key) {
    final current = _ledgers[key];
    if (current != null && identical(current._prefs, prefs)) return current;
    return _ledgers[key] = PreferenceWriteLedger._(prefs, key);
  }

  static final _ledgers = <String, PreferenceWriteLedger>{};

  final SharedPreferences _prefs;
  final String _key;
  String? _choice;
  int _choiceSequence = 0;
  int _storedSequence = 0;
  int _sequence = 0;
  int _outstanding = 0;
  bool _storedOutOfOrder = false;

  /// Dispatches [value] synchronously (the caller's linearization point),
  /// then settles the key and reports the outcome. A platform exception is
  /// rethrown after settling.
  Future<PreferenceWriteOutcome> write(String value) async {
    final sequence = ++_sequence;
    var stored = false;
    Object? error;
    StackTrace? stackTrace;
    try {
      stored = await _store(sequence, value);
    } on Object catch (caught, trace) {
      error = caught;
      stackTrace = trace;
    }
    if (stored && sequence > _choiceSequence) {
      _choiceSequence = sequence;
      _choice = value;
    }
    await _settle();
    if (error != null) Error.throwWithStackTrace(error, stackTrace!);
    if (!stored) return PreferenceWriteOutcome.failed;
    return sequence == _choiceSequence
        ? PreferenceWriteOutcome.saved
        : PreferenceWriteOutcome.superseded;
  }

  Future<bool> _store(int sequence, String? value) async {
    _outstanding++;
    var ok = false;
    try {
      ok = value == null
          ? await _prefs.remove(_key)
          : await _prefs.setString(_key, value);
    } finally {
      _outstanding--;
      if (ok) {
        if (sequence < _storedSequence) {
          _storedOutOfOrder = true;
        } else {
          _storedSequence = sequence;
        }
      }
    }
    return ok;
  }

  Future<void> _settle() async {
    if (_outstanding > 0) return; // the last write to complete settles
    if (!_storedOutOfOrder && _prefs.getString(_key) == _choice) return;
    _storedOutOfOrder = false;
    var repaired = false;
    try {
      repaired = await _store(++_sequence, _choice);
    } on Object catch (error) {
      debugPrint('Preference $_key could not be reconciled: $error');
    }
    if (!repaired) {
      debugPrint('Preference $_key could not be reconciled to $_choice');
    }
    await _settle();
  }
}
