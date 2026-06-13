import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/security/qr_login/qr_login_payload.dart';

enum QrLoginChallengeStatus {
  approved,
  consumed,
  expired,
  pending,
  rejected,
  unknown;

  static QrLoginChallengeStatus fromJson(Object? value) {
    return switch (value?.toString()) {
      'approved' => QrLoginChallengeStatus.approved,
      'consumed' => QrLoginChallengeStatus.consumed,
      'expired' => QrLoginChallengeStatus.expired,
      'pending' => QrLoginChallengeStatus.pending,
      'rejected' => QrLoginChallengeStatus.rejected,
      _ => QrLoginChallengeStatus.unknown,
    };
  }
}

class QrLoginChallenge {
  const QrLoginChallenge({
    required this.id,
    required this.payload,
    required this.expiresAt,
    required this.status,
  });

  factory QrLoginChallenge.fromJson(Map<String, dynamic> json) {
    return QrLoginChallenge(
      id: json['id'] as String,
      payload: json['payload'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      status: QrLoginChallengeStatus.fromJson(json['status']),
    );
  }

  final String id;
  final String payload;
  final DateTime expiresAt;
  final QrLoginChallengeStatus status;
}

class QrLoginCreateChallengeResult {
  const QrLoginCreateChallengeResult({
    required this.success,
    this.challenge,
    this.error,
    this.expiresIn,
  });

  final bool success;
  final QrLoginChallenge? challenge;
  final String? error;
  final int? expiresIn;
}

class QrLoginPollResult {
  const QrLoginPollResult({
    required this.success,
    required this.status,
    this.error,
    this.expiresAt,
    this.session,
  });

  final bool success;
  final QrLoginChallengeStatus status;
  final String? error;
  final DateTime? expiresAt;
  final AuthSessionPayload? session;
}

class QrLoginRepository {
  QrLoginRepository({ApiClient? apiClient, DevicePlatform? devicePlatform})
    : _apiClient = apiClient ?? ApiClient(),
      _devicePlatform = devicePlatform ?? const DefaultDevicePlatform();

  final ApiClient _apiClient;
  final DevicePlatform _devicePlatform;

  String? get _platform {
    if (_devicePlatform.isIOS) {
      return 'ios';
    }
    if (_devicePlatform.isAndroid) {
      return 'android';
    }
    return null;
  }

  Future<({bool success, String? error})> approve(
    QrLoginPayload payload,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.qrLoginApprove(payload.challengeId),
        {
          'secret': payload.secret,
          if (deviceId != null) 'deviceId': deviceId,
          if (_platform != null) 'platform': _platform,
        },
      );

      if (response['error'] != null) {
        return (success: false, error: response['error'] as String);
      }

      return (success: response['success'] == true, error: null);
    } on ApiException catch (error) {
      return (success: false, error: error.message);
    } on Exception catch (error) {
      return (success: false, error: error.toString());
    }
  }

  Future<QrLoginCreateChallengeResult> createLoginChallenge({
    required String locale,
    required String origin,
    String? captchaToken,
  }) async {
    try {
      final response = await _apiClient.postJson(
        AuthEndpoints.qrLoginChallenges,
        {
          'locale': locale,
          'origin': origin,
          if (captchaToken != null) 'captchaToken': captchaToken,
        },
        requiresAuth: false,
      );

      final challengeJson = response['challenge'] as Map<String, dynamic>?;
      return QrLoginCreateChallengeResult(
        success: response['success'] == true,
        error: response['error'] as String?,
        expiresIn: response['expiresIn'] as int?,
        challenge: challengeJson == null
            ? null
            : QrLoginChallenge.fromJson(challengeJson),
      );
    } on ApiException catch (error) {
      return QrLoginCreateChallengeResult(success: false, error: error.message);
    } on Exception catch (error) {
      return QrLoginCreateChallengeResult(
        success: false,
        error: error.toString(),
      );
    }
  }

  Future<QrLoginPollResult> pollLoginChallenge({
    required String challengeId,
    required String secret,
  }) async {
    try {
      final response = await _apiClient.getJson(
        '${AuthEndpoints.qrLoginChallenge(challengeId)}?'
        '${Uri(queryParameters: {'secret': secret}).query}',
        requiresAuth: false,
      );

      final sessionJson = response['session'] as Map<String, dynamic>?;
      final expiresAt = response['expiresAt'] as String?;
      return QrLoginPollResult(
        success: response['success'] == true,
        status: QrLoginChallengeStatus.fromJson(response['status']),
        error: response['error'] as String?,
        expiresAt: expiresAt == null ? null : DateTime.tryParse(expiresAt),
        session: sessionJson == null
            ? null
            : AuthSessionPayload.fromJson(sessionJson),
      );
    } on ApiException catch (error) {
      return QrLoginPollResult(
        success: false,
        status: QrLoginChallengeStatus.unknown,
        error: error.message,
      );
    } on Exception catch (error) {
      return QrLoginPollResult(
        success: false,
        status: QrLoginChallengeStatus.unknown,
        error: error.toString(),
      );
    }
  }
}
