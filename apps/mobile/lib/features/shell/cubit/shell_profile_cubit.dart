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

  static const Duration staleAfter = Duration(minutes: 30);

  final ProfileRepository _repository;

  void primeFromAuthenticatedUser(User user) {
    // When the signed-in user changes, do not reuse the previous user's
    // `lastUpdatedAt`. Otherwise `loadFromAuthenticatedUser` treats the new
    // session as "fresh" and skips the API, leaving name/avatar empty until
    // metadata happens to match (e.g. after opening Settings).
    final switchedAccount =
        state.userId != null && state.userId != user.id;
    emit(
      _mergeProfile(
        profile: _profileFromUser(user),
        userId: user.id,
        isFromCache: switchedAccount ? false : state.isFromCache,
        lastUpdatedAt: switchedAccount ? null : state.lastUpdatedAt,
        isRefreshing: switchedAccount ? false : state.isRefreshing,
        error: null,
      ),
    );
  }

  Future<void> loadFromAuthenticatedUser(
    User user, {
    bool forceRefresh = false,
  }) async {
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

    if (!forceRefresh &&
        state.userId == user.id &&
        state.profile != null &&
        state.lastUpdatedAt != null &&
        _isFresh(state.lastUpdatedAt!)) {
      return;
    }

    final cachedResult = await _repository.getCachedProfile();
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

    if (!forceRefresh && cachedAt != null && _isFresh(cachedAt)) {
      return;
    }

    emit(state.copyWith(isRefreshing: true, error: null));

    final result = await _repository.getProfile();
    final profile = result.profile;

    if (profile != null && profile.id == user.id) {
      final fetchedAt = DateTime.now();
      await _repository.saveCachedProfile(profile);
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

    emit(
      state.copyWith(
        isRefreshing: false,
        error: result.error,
      ),
    );
  }

  Future<void> refreshIfStale(User? user) async {
    if (user == null) {
      return;
    }

    if (state.userId != user.id ||
        state.lastUpdatedAt == null ||
        !_isFresh(state.lastUpdatedAt!)) {
      await loadFromAuthenticatedUser(user, forceRefresh: true);
    }
  }

  Future<void> applyExternalProfile(
    UserProfile profile, {
    DateTime? lastUpdatedAt,
    bool isFromCache = false,
  }) async {
    final effectiveUpdatedAt = lastUpdatedAt ?? DateTime.now();
    await _repository.saveCachedProfile(profile);
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
    emit(const ShellProfileState());
    await _repository.clearCachedProfile();
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

  bool _isFresh(DateTime fetchedAt) =>
      DateTime.now().difference(fetchedAt) < staleAfter;

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
    _repository.dispose();
    return super.close();
  }
}
