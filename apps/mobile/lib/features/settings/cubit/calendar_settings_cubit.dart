import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/repositories/calendar_settings_cache.dart';
import 'package:mobile/data/repositories/calendar_settings_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';

part 'calendar_settings_state.dart';

/// Account preferences override the active workspace, then the locale default.
class CalendarSettingsCubit extends Cubit<CalendarSettingsState> {
  CalendarSettingsCubit({
    CalendarSettingsRepository? repository,
    String? Function()? userId,
    Stream<String?>? authChanges,
  }) : _repository = repository ?? CalendarSettingsRepository(),
       _ownsRepository = repository == null,
       _currentUserId = userId ?? currentCacheUserId,
       super(const CalendarSettingsState()) {
    _authSubscription =
        (authChanges ??
                maybeSupabase?.auth.onAuthStateChange.map(
                  (event) => event.session?.user.id,
                ))
            ?.listen((actor) {
              unawaited(
                load(
                  userId: actor,
                  workspaceId: actor == _userId ? _workspaceId : null,
                ),
              );
            });
  }

  final CalendarSettingsRepository _repository;
  final bool _ownsRepository;
  final String? Function() _currentUserId;
  StreamSubscription<String?>? _authSubscription;
  String? _userId;
  String? _workspaceId;
  int _generation = 0;
  Future<void>? _pendingLoad;

  Future<void> loadUserPreference() => load(
    userId: _currentUserId(),
    workspaceId: _currentUserId() == _userId ? _workspaceId : null,
  );

  Future<void> loadWorkspacePreference(String wsId) =>
      load(userId: _currentUserId(), workspaceId: wsId);

  /// Passing a null workspace clears its visible preference synchronously.
  Future<void> load({required String? userId, required String? workspaceId}) {
    if (isClosed) return Future.value();
    final sameScope = _userId == userId && _workspaceId == workspaceId;
    if (sameScope && _pendingLoad != null) return _pendingLoad!;
    if (sameScope && state.saving) return Future.value();
    if (!sameScope && _userId != null) {
      if (_userId != userId) _repository.fence(_userId!, null);
      if (_workspaceId != null) _repository.fence(_userId!, _workspaceId);
    }
    late final Future<void> pending;
    pending = _load(userId, workspaceId).whenComplete(() {
      if (identical(_pendingLoad, pending)) _pendingLoad = null;
    });
    _pendingLoad = pending;
    return pending;
  }

  Future<void> _load(String? actor, String? workspace) async {
    final generation = ++_generation;
    final sameUser = actor != null && actor == _userId;
    final sameScope = sameUser && workspace == _workspaceId;
    _userId = actor;
    _workspaceId = workspace;
    emit(
      CalendarSettingsState(
        userPreference: sameUser ? state.userPreference : FirstDayOfWeek.auto_,
        workspacePreference: sameScope
            ? state.workspacePreference
            : FirstDayOfWeek.auto_,
        userLoaded: sameUser && state.userLoaded,
        workspaceLoaded: sameScope && state.workspaceLoaded,
        loading: actor != null,
        revalidating: actor != null,
      ),
    );
    if (actor == null) return;
    bool current() => !isClosed && generation == _generation;
    Future<void> read({required bool personal}) async {
      final id = personal ? null : workspace;
      final fresh = _repository.read(actor, id);
      unawaited(fresh.then<void>((_) {}, onError: (Object _) {}));
      try {
        final value = await _repository.snapshot(actor, id);
        if (value != null && current()) {
          emit(
            state.copyWith(
              userPreference: personal ? _parseFirstDayOfWeek(value) : null,
              workspacePreference: personal
                  ? null
                  : _parseFirstDayOfWeek(value),
              userLoaded: personal ? true : null,
              workspaceLoaded: personal ? null : true,
              loading: false,
              isFromCache: true,
            ),
          );
        }
      } on Object {
        // The awaited API response owns error and authorization presentation.
      }
      try {
        final value = await fresh;
        if (!current()) return;
        emit(
          state.copyWith(
            userPreference: personal ? _parseFirstDayOfWeek(value) : null,
            workspacePreference: personal ? null : _parseFirstDayOfWeek(value),
            userLoaded: personal ? true : null,
            workspaceLoaded: personal ? null : true,
            loading: false,
          ),
        );
      } on Object catch (error) {
        if (!current()) return;
        final denied = CalendarSettingsCache.deniesSnapshot(error);
        emit(
          state.copyWith(
            userPreference: denied && personal ? FirstDayOfWeek.auto_ : null,
            workspacePreference: denied && !personal
                ? FirstDayOfWeek.auto_
                : null,
            userLoaded: denied && personal ? false : null,
            workspaceLoaded: denied && !personal ? false : null,
            error: error,
          ),
        );
      }
    }

    await Future.wait([
      read(personal: true),
      if (workspace != null) read(personal: false),
    ]);
    if (!current()) return;
    emit(
      state.copyWith(
        loading: false,
        revalidating: false,
        isFromCache:
            state.error != null &&
            state.isFromCache &&
            (state.userLoaded || state.workspaceLoaded),
      ),
    );
  }

  /// Commits the server response; failed writes never change the selected
  /// value.
  Future<void> setFirstDayOfWeek(FirstDayOfWeek value) async {
    final actor = _userId;
    if (isClosed || actor == null || state.saving || !state.userLoaded) return;
    final generation = ++_generation;
    _pendingLoad = null;
    emit(state.copyWith(saving: true, loading: false, revalidating: false, clearError: true));
    try {
      final saved = await _repository.savePersonal(
        actor,
        _firstDayOfWeekToString(value),
      );
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          userPreference: _parseFirstDayOfWeek(saved),
          userLoaded: true,
          saving: false,
          isFromCache: false,
          clearError: true,
        ),
      );
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      emit(state.copyWith(saving: false, error: error));
    }
  }

  @override
  Future<void> close() async {
    ++_generation;
    await _authSubscription?.cancel();
    if (_ownsRepository) _repository.dispose();
    await super.close();
  }
}
