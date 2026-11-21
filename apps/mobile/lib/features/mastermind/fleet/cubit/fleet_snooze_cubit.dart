import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_snooze_store.dart';

/// Decision id to the moment it returns to the open Inbox. A snooze only
/// hides a card on this device; the decision stays open for the fleet.
///
/// Reads and writes are bound to the store's current user: a change waits
/// for that user's stored snoozes, a different user starts from their own,
/// nothing is read or written while signed out, and work that finishes after
/// [clear] or a user change is dropped. One account's snoozes are never
/// shown to, or written under, another.
class FleetSnoozeCubit extends Cubit<Map<String, DateTime>> {
  FleetSnoozeCubit({FleetSnoozeStore? store})
    : _store = store ?? MemoryFleetSnoozeStore(),
      super(const {});

  final FleetSnoozeStore _store;
  Future<void>? _loaded;
  String? _loadedScope;
  bool _ready = false;
  int _generation = 0;

  /// Reads the stored snoozes once per user; later calls share that read.
  Future<void> load() {
    final scope = _store.scope;
    if (scope == null) return Future.value();
    if (scope != _loadedScope) {
      clear();
      _loadedScope = scope;
    }
    final generation = _generation;
    return _loaded ??= _store.read().then(
      (stored) {
        if (isClosed || generation != _generation) return;
        _ready = true;
        emit({...stored, ...state});
      },
      onError: (Object _) {
        // Not ready: the next load retries, and no change is written meanwhile.
        if (generation == _generation) _loaded = null;
      },
    );
  }

  bool isSnoozed(String decisionId, DateTime now) =>
      state[decisionId]?.isAfter(now) ?? false;

  /// True once the snooze is applied; false when the stored snoozes could
  /// not be read, so nothing changed.
  Future<bool> snooze(String decisionId, DateTime until) =>
      _update((current) => {...current, decisionId: until.toUtc()});

  Future<bool> wake(String decisionId) =>
      _update((current) => {...current}..remove(decisionId));

  /// Forgets snoozes that have passed or whose decision is no longer open.
  Future<bool> prune(Set<String> openIds, DateTime now) => _update(
    (current) => {
      for (final MapEntry(:key, :value) in current.entries)
        if (openIds.contains(key) && value.isAfter(now)) key: value,
    },
  );

  /// Logout or account switch: drop what is held; the next user's snoozes
  /// load from their own key.
  void clear() {
    _generation++;
    _loaded = null;
    _loadedScope = null;
    _ready = false;
    if (!isClosed) emit(const {});
  }

  Future<bool> _update(
    Map<String, DateTime> Function(Map<String, DateTime>) change,
  ) async {
    final scope = _store.scope;
    if (scope == null) return false;
    // A clear while waiting restarts the read; the second wait covers it.
    for (var attempt = 0; attempt < 2 && !_ready; attempt++) {
      await load();
    }
    if (isClosed || !_ready || _store.scope != scope || _loadedScope != scope) {
      return false;
    }
    final next = change(state);
    if (_same(next, state)) return true;
    emit(Map.unmodifiable(next));
    try {
      await _store.write(next);
    } on Object {
      // Device storage failing keeps the snooze for this session only.
    }
    return true;
  }

  static bool _same(Map<String, DateTime> a, Map<String, DateTime> b) =>
      a.length == b.length && a.entries.every((e) => b[e.key] == e.value);
}
