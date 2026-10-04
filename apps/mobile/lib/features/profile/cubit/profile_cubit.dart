import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';

/// Cubit for managing user profile state.
class ProfileCubit extends Cubit<ProfileState> {
  ProfileCubit({required ProfileRepository profileRepository})
    : _repository = profileRepository,
      super(const ProfileState());

  final ProfileRepository _repository;
  int _loadGeneration = 0;
  int _updateGeneration = 0;
  String? _updatingActor;

  bool _sameActor(String? actor) =>
      !isClosed && actor != null && _repository.getCurrentUserIdSync() == actor;
  static UserProfile? _memoryCachedProfile;
  static DateTime? _memoryCachedAt;
  static String? _memoryCachedUserId;

  static void clearMemoryCache() {
    _memoryCachedProfile = null;
    _memoryCachedAt = null;
    _memoryCachedUserId = null;
  }

  /// Loads the user's profile.
  Future<void> loadProfile({
    bool forceRefresh = false,
    bool emitLoading = true,
  }) async {
    final generation = ++_loadGeneration;
    final currentUserId = _repository.getCurrentUserIdSync();
    if (state.profile != null && state.profile!.id != currentUserId) {
      emit(
        ProfileState(
          status: ProfileStatus.loading,
          isLoading: _updatingActor == currentUserId,
        ),
      );
    }
    final cachedProfile = _memoryCachedUserId == currentUserId
        ? _memoryCachedProfile
        : null;
    final cachedAt = _memoryCachedAt;
    final persistedCache = cachedProfile == null
        ? await _repository.getCachedProfile()
        : (profile: cachedProfile, fetchedAt: cachedAt);
    if (!_sameActor(currentUserId) || generation != _loadGeneration) return;
    final persistedProfile = switch (persistedCache.profile?.id) {
      final String profileId when profileId == currentUserId =>
        persistedCache.profile,
      _ => null,
    };
    final visibleProfile = switch (state.profile?.id) {
      final String profileId when profileId == currentUserId => state.profile,
      _ => persistedProfile,
    };

    if (visibleProfile != null && state.profile == null) {
      emit(
        state.copyWith(
          status: ProfileStatus.loaded,
          profile: visibleProfile,
          error: null,
          isLoading: _updatingActor == currentUserId,
          isRefreshing: false,
          isFromCache: true,
          lastUpdatedAt: persistedProfile == null
              ? null
              : persistedCache.fetchedAt,
        ),
      );
    }

    if (emitLoading && visibleProfile == null) {
      emit(
        state.copyWith(
          status: ProfileStatus.loading,
          error: null,
          isLoading: _updatingActor == currentUserId,
          isRefreshing: false,
        ),
      );
    } else if (visibleProfile != null) {
      emit(
        state.copyWith(
          status: ProfileStatus.loaded,
          error: null,
          isRefreshing: true,
        ),
      );
    }

    final result = await _repository.getProfile();

    if (!_sameActor(currentUserId) || generation != _loadGeneration) return;
    if (result.profile != null && result.profile!.id == currentUserId) {
      _memoryCachedProfile = result.profile;
      _memoryCachedAt = DateTime.now();
      _memoryCachedUserId = result.profile!.id;
      await _repository.saveCachedProfile(result.profile!);
      if (!_sameActor(currentUserId) || generation != _loadGeneration) return;
      emit(
        state.copyWith(
          status: ProfileStatus.loaded,
          profile: result.profile,
          error: null,
          isLoading: _updatingActor == currentUserId,
          isRefreshing: false,
          isFromCache: false,
          lastUpdatedAt: _memoryCachedAt,
        ),
      );
    } else {
      if (visibleProfile != null) {
        emit(
          state.copyWith(
            status: ProfileStatus.loaded,
            error: null,
            isLoading: _updatingActor == currentUserId,
            isRefreshing: false,
            isFromCache: true,
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          error: result.error,
          isLoading: _updatingActor == currentUserId,
          isRefreshing: false,
        ),
      );
    }
  }

  /// Updates display name.
  Future<bool> updateDisplayName(String displayName) async {
    return await _updateProfileField(
      () => _repository.updateDisplayName(displayName),
    );
  }

  /// Updates full name.
  Future<bool> updateFullName(String fullName) async {
    return await _updateProfileField(
      () => _repository.updateFullName(fullName),
    );
  }

  /// Updates email.
  Future<bool> updateEmail(String email) async {
    return await _updateProfileField(() => _repository.updateEmail(email));
  }

  Future<bool> _updateProfileField(
    Future<({bool success, String? error})> Function() update,
  ) async {
    final actor = _repository.getCurrentUserIdSync();
    if (!_sameActor(actor)) return false;
    final operation = ++_updateGeneration;
    _updatingActor = actor;
    bool current() => operation == _updateGeneration && _sameActor(actor);
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final result = await update();
      if (!current()) return false;
      if (!result.success) {
        emit(state.copyWith(error: result.error));
        return false;
      }
      final cached = await _repository.getCachedProfile();
      if (!current()) return false;
      if (cached.profile?.id == actor) {
        emit(state.copyWith(profile: cached.profile));
      }
      await loadProfile(forceRefresh: true, emitLoading: false);
      return current();
    } finally {
      // An obsolete completion must never release a newer actor's operation.
      if (!isClosed && operation == _updateGeneration) {
        _updatingActor = null;
        emit(state.copyWith(isLoading: false));
      }
    }
  }

  /// Uploads avatar.
  Future<bool> uploadAvatar(File file) =>
      _updateProfileField(() => _repository.saveAvatar(file));

  Future<bool> uploadBanner(File file) =>
      _updateProfileField(() => _repository.saveBanner(file));

  Future<bool> removeBanner() => _updateProfileField(_repository.removeBanner);

  /// Removes avatar.
  Future<bool> removeAvatar() => _updateProfileField(_repository.removeAvatar);

  void clearError() => emit(state.copyWith(error: null));

  @override
  Future<void> close() {
    _repository.dispose();
    return super.close();
  }
}
