import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/settings/cubit/sorbet_state.dart';
import 'package:mobile/features/settings/data/sorbet_preferences_repository.dart';

/// Follows the account's Sorbet opt-in and look.
///
/// Binding an account shows its device cache at once, then the account
/// values. A change applies immediately, is cached, marked pending and
/// uploaded; a failed upload keeps the local value pending for the next
/// bind. An account switch ends the previous account's work, and a field
/// changed locally is never replaced by an account value loaded before it.
class SorbetCubit extends Cubit<SorbetState> {
  SorbetCubit({SorbetPreferencesRepository? repository})
    : _repository = repository ?? SorbetPreferencesRepository(),
      super(const SorbetState());

  final SorbetPreferencesRepository _repository;

  /// Bumped on every account change so work for a previous account stops.
  int _scope = 0;
  bool _bound = false;
  String? _userId;

  /// Fields changed on this device since the current account was bound.
  final Set<SorbetField> _changed = {};
  Future<void> _uploads = Future.value();

  /// [userId] is the signed-in user, or null when signed out.
  Future<void> bindAccount(String? userId) async {
    if (isClosed || (_bound && userId == _userId)) return;
    final switched = _bound;
    _bound = true;
    _userId = userId;
    _changed.clear();
    final scope = ++_scope;
    bool current() => !isClosed && scope == _scope;
    // The previous account's look stops showing immediately.
    if (switched) emit(const SorbetState());
    try {
      final cached = await _repository.readCache(userId);
      if (!current()) return;
      if (cached != null && _changed.isEmpty) {
        emit(SorbetState(preferences: cached));
      }
      if (userId == null) return;
      final remote = await _repository.loadAccount(userId);
      if (!current()) return;
      final pending = await _repository.pendingFields(userId);
      if (!current()) return;
      final keep = {...pending, ..._changed};
      final local = state.preferences;
      final merged = SorbetPreferences(
        enabled: keep.contains(SorbetField.enabled)
            ? local.enabled
            : remote.enabled,
        theme: keep.contains(SorbetField.theme) ? local.theme : remote.theme,
      );
      emit(SorbetState(preferences: merged));
      await _repository.writeCache(userId, merged);
      if (pending.isNotEmpty) await _upload(userId);
    } on Exception catch (e) {
      debugPrint('Error syncing Sorbet preferences: $e');
    }
  }

  Future<void> setEnabled({required bool enabled}) => _change(
    SorbetField.enabled,
    state.preferences.copyWith(enabled: enabled),
  );

  Future<void> setTheme(SorbetTheme theme) =>
      _change(SorbetField.theme, state.preferences.copyWith(theme: theme));

  Future<void> _change(SorbetField field, SorbetPreferences next) async {
    if (isClosed || next == state.preferences) return;
    final userId = _userId;
    _changed.add(field);
    emit(SorbetState(preferences: next));
    try {
      await _repository.writeCache(userId, next);
      if (userId == null) return;
      await _repository.setPending(userId, field, pending: true);
      await _upload(userId);
    } on Exception catch (e) {
      debugPrint('Error saving Sorbet preferences: $e');
    }
  }

  /// Uploads run one at a time and each sends the newest cached values, so
  /// an older value can never land last.
  Future<void> _upload(String userId) =>
      _uploads = _uploads.then((_) => _drain(userId));

  Future<void> _drain(String userId) async {
    try {
      final pending = await _repository.pendingFields(userId);
      final sent = await _repository.readCache(userId);
      if (pending.isEmpty || sent == null) return;
      for (final field in pending) {
        switch (field) {
          case SorbetField.enabled:
            await _repository.saveEnabled(userId, enabled: sent.enabled);
          case SorbetField.theme:
            await _repository.saveTheme(userId, sent.theme);
        }
        // Stays pending when a newer value was cached meanwhile; its own
        // upload is queued behind this one.
        final latest = await _repository.readCache(userId);
        final unchanged = switch (field) {
          SorbetField.enabled => latest?.enabled == sent.enabled,
          SorbetField.theme => latest?.theme == sent.theme,
        };
        if (unchanged) {
          await _repository.setPending(userId, field, pending: false);
        }
      }
    } on Exception catch (e) {
      // Stays pending; the next bind retries it.
      debugPrint('Error uploading Sorbet preferences: $e');
    }
  }
}
