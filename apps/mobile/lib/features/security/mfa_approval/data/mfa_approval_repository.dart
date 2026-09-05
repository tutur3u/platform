import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/sources/api_client.dart';

class PendingMfaApproval {
  const PendingMfaApproval({
    required this.id,
    required this.pairCode,
    required this.expiresAt,
    required this.createdAt,
  });

  factory PendingMfaApproval.fromJson(Map<String, dynamic> json) {
    return PendingMfaApproval(
      id: json['id'] as String? ?? '',
      pairCode: json['pairCode'] as String? ?? '',
      expiresAt:
          DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  final String id;
  final String pairCode;
  final DateTime expiresAt;
  final DateTime createdAt;
}

class MfaApprovalRepository {
  MfaApprovalRepository({ApiClient? apiClient, DevicePlatform? devicePlatform})
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

  Future<
    ({
      List<PendingMfaApproval> approvals,
      bool requiresMobileMfa,
      String? error,
    })
  >
  listPending() async {
    try {
      final response = await _apiClient.getJson(
        AuthEndpoints.mfaMobileApprovals,
      );

      if (response['error'] != null) {
        return (
          approvals: const <PendingMfaApproval>[],
          requiresMobileMfa: false,
          error: response['error'] as String,
        );
      }

      final approvalsJson = response['approvals'];
      final approvals = approvalsJson is List
          ? approvalsJson
                .whereType<Map<String, dynamic>>()
                .map(PendingMfaApproval.fromJson)
                .where(
                  (approval) =>
                      approval.id.isNotEmpty && approval.pairCode.isNotEmpty,
                )
                .toList(growable: false)
          : const <PendingMfaApproval>[];

      return (
        approvals: approvals,
        requiresMobileMfa: response['requiresMobileMfa'] == true,
        error: null,
      );
    } on ApiException catch (error) {
      return (
        approvals: const <PendingMfaApproval>[],
        requiresMobileMfa: false,
        error: error.message,
      );
    } on Exception catch (error) {
      return (
        approvals: const <PendingMfaApproval>[],
        requiresMobileMfa: false,
        error: error.toString(),
      );
    }
  }

  Future<({bool success, String? error})> approve(
    PendingMfaApproval approval,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient
          .postJson(AuthEndpoints.mfaMobileApprovalApprove(approval.id), {
            'pairCode': approval.pairCode,
            if (deviceId != null) 'deviceId': deviceId,
            if (_platform != null) 'platform': _platform,
          });

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
}
