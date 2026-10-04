import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/cache/profile_banner_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_media_optimization.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository for profile operations.
class ProfileRepository {
  /// When no clients are provided, this repository creates and owns them.
  ProfileRepository({
    ApiClient? apiClient,
    http.Client? httpClient,
    bool ownsApiClient = false,
    bool ownsHttpClient = false,
    OfflineMutationQueue? bannerMutationQueue,
  }) : _apiClient = apiClient ?? ApiClient(),
       _httpClient = httpClient ?? http.Client(),
       _bannerMutationQueue = bannerMutationQueue,
       _ownsApiClient = apiClient == null || ownsApiClient,
       _ownsHttpClient = httpClient == null || ownsHttpClient;

  final OfflineMutationQueue? _bannerMutationQueue;
  final ApiClient _apiClient;
  final http.Client _httpClient;
  final bool _ownsApiClient;
  final bool _ownsHttpClient;
  static const _cachedProfileKey = 'cached-user-profile';
  static const _cachedProfileFetchedAtKey = 'cached-user-profile-fetched-at';

  String? getCurrentUserIdSync() => maybeSupabase?.auth.currentUser?.id;

  String _cachedProfileKeyFor(String userId) => '$_cachedProfileKey:$userId';

  String _cachedProfileFetchedAtKeyFor(String userId) =>
      '$_cachedProfileFetchedAtKey:$userId';

  CacheKey _replicaKey(String userId) => CacheKey(
    namespace: 'profile.user',
    userId: userId,
    workspaceId: 'personal',
    params: const {'path': ProfileEndpoints.profile},
  );

  Future<UserProfile> _overlayPendingProfile(UserProfile profile) async {
    final json = profile.toJson();
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature != 'profile' || item.workspaceId != 'personal') continue;
      if (item.path == ProfileEndpoints.banner &&
          item.payload?['action'] == 'remove') {
        json['banner_url'] = null;
      } else if (item.path == ProfileEndpoints.avatar &&
          item.method == 'DELETE') {
        json['avatar_url'] = null;
      } else if (item.path == ProfileEndpoints.email) {
        json['new_email'] = item.payload?['email'];
      } else if (item.path == ProfileEndpoints.fullName ||
          item.path == ProfileEndpoints.profile) {
        json.addAll(item.payload ?? const {});
      }
    }
    return UserProfile.fromJson(json);
  }

  Future<void> _writeProfile(
    String method,
    String path, {
    Map<String, dynamic>? payload,
  }) async {
    final userId = getCurrentUserIdSync();
    await queueOrSendVoid(
      feature: 'profile',
      method: method,
      path: path,
      workspaceId: 'personal',
      entityId: userId,
      payload: payload,
      send: () async {
        if (method == 'DELETE') {
          await _apiClient.deleteJson(path);
        } else {
          await _apiClient.patchJson(path, payload ?? {});
        }
      },
    );
    final pending = await OfflineMutationQueue.instance.listPending();
    if (pending.any(
      (item) =>
          item.feature == 'profile' &&
          item.workspaceId == 'personal' &&
          item.path == path,
    )) {
      final cached = await getCachedProfile();
      if (cached.profile != null) {
        await saveCachedProfile(cached.profile!);
      }
    } else {
      await CacheStore.instance.invalidateTags({
        'module:profile',
      }, workspaceId: 'personal');
    }
  }

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
    if (_ownsHttpClient) {
      _httpClient.close();
    }
  }

  Future<({bool success, String? error})> saveAvatar(File file) =>
      _saveMedia(file, banner: false);

  Future<({bool success, String? error})> saveBanner(File file) =>
      _saveMedia(file, banner: true);

  Future<({bool success, String? error})> removeBanner() async {
    try {
      final actor = getCurrentUserIdSync();
      if (actor == null) {
        throw const ApiException(
          message: 'Profile actor is unavailable',
          statusCode: 401,
        );
      }
      final payload = {'action': 'remove', 'operationId': newLocalMutationId()};
      await queueBannerWrite(
        actor: actor,
        currentActor: getCurrentUserIdSync,
        queue: _bannerMutationQueue,
        method: 'POST',
        path: ProfileEndpoints.banner,
        payload: payload,
        send: () => ApiClient.runForUser(actor, () async {
          await _apiClient.postJson(ProfileEndpoints.banner, payload);
        }),
      );
      return (success: true, error: null);
    } on ApiException catch (error) {
      return (success: false, error: error.message);
    } on Exception {
      return (success: false, error: 'Profile update failed');
    }
  }

  Future<({bool success, String? error})> _saveMedia(
    File file, {
    required bool banner,
  }) async {
    try {
      final actor = getCurrentUserIdSync();
      if (actor == null) {
        throw const FormatException('Profile actor is unavailable');
      }
      final optimized = await optimizeProfileMedia(file, banner: banner);
      if (getCurrentUserIdSync() != actor) {
        throw const FormatException('Profile actor changed');
      }
      final payload = {
        'filename': banner ? 'banner.jpg' : 'avatar.jpg',
        if (banner) 'operationId': newLocalMutationId(),
        'contentType': 'image/jpeg',
        'bytes': base64Encode(optimized),
      };
      Future<void> send() => ApiClient.runForUser(
        actor,
        () => deliverProfileAvatar(
          api: _apiClient,
          httpClient: _httpClient,
          filename: payload['filename']!,
          contentType: payload['contentType']!,
          encodedBytes: payload['bytes']!,
          banner: banner,
          operationId: payload['operationId'],
        ),
      );
      if (banner) {
        await queueBannerWrite(
          actor: actor,
          currentActor: getCurrentUserIdSync,
          queue: _bannerMutationQueue,
          method: 'PROFILE_BANNER_UPLOAD',
          path: ProfileEndpoints.bannerUploadUrl,
          payload: payload,
          send: send,
        );
      } else {
        await queueOrSendVoid(
          feature: 'profile',
          method: 'PROFILE_AVATAR_UPLOAD',
          path: ProfileEndpoints.avatarUploadUrl,
          workspaceId: 'personal',
          entityId: actor,
          payload: payload,
          send: send,
        );
      }
      return (success: true, error: null);
    } on ApiException catch (error) {
      return (success: false, error: error.message);
    } on Exception catch (error) {
      return (success: false, error: error.toString());
    }
  }

  /// Gets signed upload URL for avatar.
  Future<({AvatarUploadUrlResponse? response, String? error})>
  getAvatarUploadUrl(String filename) async {
    try {
      final response = await _apiClient.postJson(
        ProfileEndpoints.avatarUploadUrl,
        {'filename': filename},
      );

      return (
        response: AvatarUploadUrlResponse.fromJson(response),
        error: null,
      );
    } on ApiException catch (e) {
      return (response: null, error: e.message);
    } on Exception catch (e) {
      return (response: null, error: e.toString());
    }
  }

  /// Fetches the current user's profile.
  Future<({UserProfile? profile, String? error})> getProfile() async {
    try {
      final json = await _apiClient.getJson(ProfileEndpoints.profile);
      return (
        profile: await _overlayPendingProfile(UserProfile.fromJson(json)),
        error: null,
      );
    } on ApiException catch (e) {
      return (profile: null, error: e.message);
    } on Exception catch (e) {
      return (profile: null, error: e.toString());
    }
  }

  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async {
    final userId = getCurrentUserIdSync();
    if (userId == null || userId.isEmpty) {
      return (profile: null, fetchedAt: null);
    }

    final cached = await CacheStore.instance.read<UserProfile>(
      key: _replicaKey(userId),
      decode: (data) =>
          UserProfile.fromJson(Map<String, dynamic>.from(data! as Map)),
    );
    if (cached.data != null) {
      return (
        profile: await _overlayPendingProfile(cached.data!),
        fetchedAt: cached.fetchedAt,
      );
    }
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cachedProfileKeyFor(userId));
    if (raw == null) return (profile: null, fetchedAt: null);
    try {
      final profile = UserProfile.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      final legacyFetchedAt = DateTime.tryParse(
        prefs.getString(_cachedProfileFetchedAtKeyFor(userId)) ?? '',
      );
      await saveCachedProfile(profile);
      return (
        profile: await _overlayPendingProfile(profile),
        fetchedAt: legacyFetchedAt,
      );
    } on Object {
      return (profile: null, fetchedAt: null);
    }
  }

  Future<void> saveCachedProfile(UserProfile profile) async {
    await CacheStore.instance.write(
      key: _replicaKey(profile.id),
      policy: CachePolicies.offlineCatalog,
      payload: profile.toJson(),
      tags: const ['module:profile', 'workspace:personal'],
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cachedProfileKeyFor(profile.id));
    await prefs.remove(_cachedProfileFetchedAtKeyFor(profile.id));
  }

  Future<void> clearCachedProfile() async {
    // Capture the actor before awaiting storage: a switch must not clear the
    // next account's profile replica.
    final userId = getCurrentUserIdSync();
    final prefs = await SharedPreferences.getInstance();
    if (userId != null && userId.isNotEmpty) {
      await CacheStore.instance.remove(_replicaKey(userId));
      await prefs.remove(_cachedProfileKeyFor(userId));
      await prefs.remove(_cachedProfileFetchedAtKeyFor(userId));
    }
    await prefs.remove(_cachedProfileKey);
    await prefs.remove(_cachedProfileFetchedAtKey);
  }

  /// Removes avatar.
  Future<({bool success, String? error})> removeAvatar() async {
    try {
      await _writeProfile('DELETE', ProfileEndpoints.avatar);
      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  /// Updates avatar URL.
  Future<({bool success, String? error})> updateAvatarUrl(
    String? avatarUrl,
  ) async {
    try {
      await _writeProfile(
        'PATCH',
        ProfileEndpoints.profile,
        payload: {'avatar_url': avatarUrl},
      );

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  /// Updates display name.
  Future<({bool success, String? error})> updateDisplayName(
    String displayName,
  ) async {
    try {
      await _writeProfile(
        'PATCH',
        ProfileEndpoints.profile,
        payload: {'display_name': displayName},
      );

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  /// Updates email.
  Future<({bool success, String? error})> updateEmail(String email) async {
    try {
      await _writeProfile(
        'PATCH',
        ProfileEndpoints.email,
        payload: {'email': email},
      );

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  /// Updates full name.
  Future<({bool success, String? error})> updateFullName(
    String fullName,
  ) async {
    try {
      await _writeProfile(
        'PATCH',
        ProfileEndpoints.fullName,
        payload: {'full_name': fullName},
      );

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  /// Uploads avatar file to signed URL.
  Future<({bool success, String? error})> uploadAvatarFile(
    String uploadUrl,
    File file,
  ) async {
    try {
      final bytes = await file.readAsBytes();
      final contentType =
          lookupMimeType(file.path) ?? 'application/octet-stream';
      final response = await _httpClient
          .put(
            Uri.parse(uploadUrl),
            body: bytes,
            headers: {'Content-Type': contentType},
          )
          .timeout(const Duration(seconds: 60));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return (success: true, error: null);
      } else {
        return (success: false, error: 'Upload failed');
      }
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }
}
