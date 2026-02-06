import 'dart:async';

import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Repository for all authentication operations.
///
/// Ported from apps/native/lib/stores/auth-store.ts.
class AuthRepository {
  AuthRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  // ── OTP ─────────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> sendOtp(
    String email,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.sendOtp,
        {
          'email': email,
          'locale': getLocale(),
          if (deviceId != null) 'deviceId': deviceId,
        },
      );

      if (response['error'] != null) {
        return (
          success: false,
          error: response['error'] as String,
          retryAfter: response['retryAfter'] as int?,
        );
      }

      return (success: true, error: null, retryAfter: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message, retryAfter: e.retryAfter);
    }
  }

  Future<({bool success, String? error})> verifyOtp(
    String email,
    String otp,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.verifyOtp,
        {
          'email': email,
          'otp': otp,
          'locale': getLocale(),
          if (deviceId != null) 'deviceId': deviceId,
        },
      );

      if (response['error'] != null) {
        return (success: false, error: response['error'] as String);
      }

      final sessionJson = response['session'] as Map<String, dynamic>?;
      if (sessionJson == null) {
        return (success: false, error: 'No session returned');
      }

      final payload = AuthSessionPayload.fromJson(sessionJson);
      await supabase.auth.setSession(payload.accessToken);

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    }
  }

  // ── Password ────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> passwordLogin(
    String email,
    String password,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.passwordLogin,
        {
          'email': email,
          'password': password,
          'locale': getLocale(),
          if (deviceId != null) 'deviceId': deviceId,
        },
      );

      if (response['error'] != null) {
        return (
          success: false,
          error: response['error'] as String,
          retryAfter: response['retryAfter'] as int?,
        );
      }

      final sessionJson = response['session'] as Map<String, dynamic>?;
      if (sessionJson == null) {
        return (success: false, error: 'No session returned', retryAfter: null);
      }

      final payload = AuthSessionPayload.fromJson(sessionJson);
      await supabase.auth.setSession(payload.accessToken);

      return (success: true, error: null, retryAfter: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message, retryAfter: e.retryAfter);
    }
  }

  // ── Sign up ─────────────────────────────────────

  Future<({bool success, String? error})> signUp(
    String email,
    String password,
  ) async {
    try {
      final response = await supabase.auth.signUp(
        email: email,
        password: password,
      );

      if (response.user == null) {
        return (success: false, error: 'Sign up failed');
      }

      return (success: true, error: null);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    }
  }

  // ── Password reset ──────────────────────────────

  Future<({bool success, String? error})> resetPassword(String email) async {
    try {
      await supabase.auth.resetPasswordForEmail(email);
      return (success: true, error: null);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    }
  }

  // ── Session management ──────────────────────────

  Future<User?> getCurrentUser() async {
    return supabase.auth.currentUser;
  }

  Future<Session?> getCurrentSession() async {
    return supabase.auth.currentSession;
  }

  Stream<AuthState> onAuthStateChange() {
    return supabase.auth.onAuthStateChange;
  }

  Future<void> signOut() async {
    await supabase.auth.signOut();
  }

  Future<void> refreshSession() async {
    await supabase.auth.refreshSession();
  }

  void dispose() {
    _apiClient.dispose();
  }
}
