import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/sources/api_client.dart';

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
      final response = await _httpClient.put(
        Uri.parse(uploadUrl),
        body: bytes,
        headers: {
          'Content-Type': contentType,
        },
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return (success: true, error: null);
      } else {
        return (success: false, error: 'Upload failed');
      }
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
    }
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

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
    if (_ownsHttpClient) {
      _httpClient.close();
    }
  }
}
