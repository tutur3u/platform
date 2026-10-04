import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

class ShellProfileCubit extends Cubit<ShellProfileState> {
  ShellProfileCubit({required ProfileRepository profileRepository})
    : _repository = profileRepository,
      super(const ShellProfileState());

  final ProfileRepository _repository;
  int _generation = 0;
  Future<void> _cacheWrites = Future<void>.value();

  bool _isCurrent(int generation, String userId) =>
      !isClosed && _generation == generation && state.userId == userId;

  Future<void> _saveIfCurrent(UserProfile profile, int generation) {
    final write = _cacheWrites.catchError((Object _) {}).then((_) async {
      if (_isCurrent(generation, profile.id)) {
        await _repository.saveCachedProfile(profile);
      }
    });
    _cacheWrites = write;
    return write;
  }

  void primeFromAuthenticatedUser(User user) {
    if (isClosed) return;
    if (state.userId != user.id) _generation++;
    // When the signed-in user changes, do not reuse the previous user's
    // `lastUpdatedAt`. Otherwise `loadFromAuthenticatedUser` treats the new
    // session as "fresh" and skips the API, leaving name/avatar empty until
    // metadata happens to match (e.g. after opening Settings).
    final switchedAccount = state.userId != null && state.userId != user.id;
    emit(
      _mergeProfile(
        profile: _profileFromUser(user),
        userId: user.id,
        isFromCache: !switchedAccount && state.isFromCache,
        lastUpdatedAt: switchedAccount ? null : state.lastUpdatedAt,
        isRefreshing: !switchedAccount && state.isRefreshing,
        error: null,
      ),
    );
  }

  Future<void> loadFromAuthenticatedUser(
    User user, {
    bool forceRefresh = false,
  }) async {
    if (isClosed) return;
    final userChanged = state.userId != user.id;

    if (userChanged) {
      primeFromAuthenticatedUser(user);
    } else if (state.profile == null) {
      emit(
        _mergeProfile(
          profile: _profileFromUser(user),
          userId: user.id,
          isFromCache: state.isFromCache,
          lastUpdatedAt: state.lastUpdatedAt,
          isRefreshing: state.isRefreshing,
          error: null,
        ),
      );
    }

    final generation = ++_generation;
    final cachedResult = await _repository.getCachedProfile();
    if (!_isCurrent(generation, user.id)) return;
    final cachedProfile = cachedResult.profile?.id == user.id
        ? cachedResult.profile
        : null;
    final cachedAt = cachedProfile == null ? null : cachedResult.fetchedAt;

    if (cachedProfile != null) {
      emit(
        _mergeProfile(
          profile: cachedProfile,
          userId: user.id,
          isFromCache: true,
          lastUpdatedAt: cachedAt,
          isRefreshing: false,
          error: null,
        ),
      );
    }

    emit(state.copyWith(isRefreshing: true, error: null));

    final result = await _repository.getProfile();
    if (!_isCurrent(generation, user.id)) return;
    final profile = result.profile;

    if (profile != null && profile.id == user.id) {
      final fetchedAt = DateTime.now();
      await _saveIfCurrent(profile, generation);
      if (!_isCurrent(generation, user.id)) return;
      emit(
        _mergeProfile(
          profile: profile,
          userId: user.id,
          isFromCache: false,
          lastUpdatedAt: fetchedAt,
          isRefreshing: false,
          error: null,
        ),
      );
      return;
    }

    emit(state.copyWith(isRefreshing: false, error: result.error));
  }

  Future<void> refreshIfStale(User? user) async {
    if (user == null) {
      return;
    }

    await loadFromAuthenticatedUser(user, forceRefresh: true);
  }

  Future<void> applyExternalProfile(
    UserProfile profile, {
    DateTime? lastUpdatedAt,
    bool isFromCache = false,
  }) async {
    if (isClosed || state.userId != profile.id) return;
    final generation = ++_generation;
    final effectiveUpdatedAt = lastUpdatedAt ?? DateTime.now();
    await _saveIfCurrent(profile, generation);
    if (!_isCurrent(generation, profile.id)) return;
    emit(
      _mergeProfile(
        profile: profile,
        userId: profile.id,
        isFromCache: isFromCache,
        lastUpdatedAt: effectiveUpdatedAt,
        isRefreshing: false,
        error: null,
      ),
    );
  }

  Future<void> clear() async {
    if (isClosed) return;
    final generation = ++_generation;
    emit(const ShellProfileState());
    // Finish any already-started actor-keyed write before clearing it. Queued
    // obsolete writes are skipped by their generation check.
    final clear = _cacheWrites.catchError((Object _) {}).then((_) async {
      if (!isClosed && _generation == generation && state.userId == null) {
        await _repository.clearCachedProfile();
      }
    });
    _cacheWrites = clear;
    await clear;
  }

  ShellProfileState _mergeProfile({
    required UserProfile profile,
    required String userId,
    required bool isFromCache,
    required DateTime? lastUpdatedAt,
    required bool isRefreshing,
    required String? error,
  }) {
    final nextAvatarUrl = normalizeAvatarUrl(profile.avatarUrl);
    final nextAvatarIdentityKey = avatarIdentityKeyForUrl(nextAvatarUrl);
    final shouldKeepCurrentAvatar =
        state.userId == userId &&
        state.avatarUrl != null &&
        state.avatarIdentityKey != null &&
        state.avatarIdentityKey == nextAvatarIdentityKey;

    return ShellProfileState(
      userId: userId,
      profile: profile,
      avatarUrl: shouldKeepCurrentAvatar ? state.avatarUrl : nextAvatarUrl,
      avatarIdentityKey: nextAvatarIdentityKey,
      isRefreshing: isRefreshing,
      isFromCache: isFromCache,
      lastUpdatedAt: lastUpdatedAt,
      error: error,
    );
  }

  UserProfile _profileFromUser(User user) {
    final metadata = user.userMetadata;

    return UserProfile(
      id: user.id,
      email: user.email,
      displayName: _nonEmpty(metadata?['display_name'] as String?),
      avatarUrl: normalizeAvatarUrl(metadata?['avatar_url'] as String?),
      fullName: _nonEmpty(metadata?['full_name'] as String?),
    );
  }

  String? _nonEmpty(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    return value.trim();
  }

  @override
  Future<void> close() {
    _generation++;
    _repository.dispose();
    return super.close();
  }
}
