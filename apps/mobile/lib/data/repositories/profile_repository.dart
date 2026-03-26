import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository for profile operations.
class ProfileRepository {
  /// When no clients are provided, this repository creates and owns them.
  ProfileRepository({
    ApiClient? apiClient,
    http.Client? httpClient,
    bool ownsApiClient = false,
    bool ownsHttpClient = false,
  }) : _apiClient = apiClient ?? ApiClient(),
       _httpClient = httpClient ?? http.Client(),
       _ownsApiClient = apiClient == null || ownsApiClient,
       _ownsHttpClient = httpClient == null || ownsHttpClient;

  final ApiClient _apiClient;
  final http.Client _httpClient;
  final bool _ownsApiClient;
  final bool _ownsHttpClient;
  static const _cachedProfileKey = 'cached-user-profile';
  static const _cachedProfileFetchedAtKey = 'cached-user-profile-fetched-at';

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
    if (_ownsHttpClient) {
      _httpClient.close();
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
      return (profile: UserProfile.fromJson(json), error: null);
    } on ApiException catch (e) {
      return (profile: null, error: e.message);
    } on Exception catch (e) {
      return (profile: null, error: e.toString());
    }
  }

  Future<({UserProfile? profile, DateTime? fetchedAt})>
  getCachedProfile() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cachedProfileKey);
    final fetchedAtRaw = prefs.getString(_cachedProfileFetchedAtKey);
    if (raw == null) {
      return (profile: null, fetchedAt: null);
    }

    try {
      return (
        profile: UserProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>),
        fetchedAt: fetchedAtRaw == null
            ? null
            : DateTime.tryParse(fetchedAtRaw),
      );
    } on Object {
      return (profile: null, fetchedAt: null);
    }
  }

  Future<void> saveCachedProfile(UserProfile profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cachedProfileKey, jsonEncode(profile.toJson()));
    await prefs.setString(
      _cachedProfileFetchedAtKey,
      DateTime.now().toIso8601String(),
    );
  }

  Future<void> clearCachedProfile() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cachedProfileKey);
    await prefs.remove(_cachedProfileFetchedAtKey);
  }

  /// Removes avatar.
  Future<({bool success, String? error})> removeAvatar() async {
    try {
      await _apiClient.deleteJson(ProfileEndpoints.avatar);
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
      await _apiClient.patchJson(
        ProfileEndpoints.profile,
        {'avatar_url': avatarUrl},
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
      await _apiClient.patchJson(
        ProfileEndpoints.profile,
        {'display_name': displayName},
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
      await _apiClient.patchJson(
        ProfileEndpoints.email,
        {'email': email},
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
      await _apiClient.patchJson(
        ProfileEndpoints.fullName,
        {'full_name': fullName},
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
            headers: {
              'Content-Type': contentType,
            },
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
