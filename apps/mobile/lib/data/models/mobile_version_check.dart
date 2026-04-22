enum MobileUpdateStatus {
  supported,
  updateRecommended,
  updateRequired
  ;

  static MobileUpdateStatus fromApiValue(String value) {
    switch (value) {
      case 'update-recommended':
        return MobileUpdateStatus.updateRecommended;
      case 'update-required':
        return MobileUpdateStatus.updateRequired;
      case 'supported':
      default:
        return MobileUpdateStatus.supported;
    }
  }
}

class MobileVersionCheck {
  const MobileVersionCheck({
    required this.platform,
    required this.currentVersion,
    required this.otpEnabled,
    required this.status,
    required this.shouldUpdate,
    required this.requiresUpdate,
    this.effectiveVersion,
    this.minimumVersion,
    this.storeUrl,
  });

  factory MobileVersionCheck.fromJson(Map<String, dynamic> json) {
    return MobileVersionCheck(
      platform: json['platform'] as String? ?? 'unknown',
      currentVersion: json['currentVersion'] as String? ?? '',
      effectiveVersion: json['effectiveVersion'] as String?,
      minimumVersion: json['minimumVersion'] as String?,
      otpEnabled: json['otpEnabled'] as bool? ?? false,
      storeUrl: json['storeUrl'] as String?,
      status: MobileUpdateStatus.fromApiValue(
        json['status'] as String? ?? 'supported',
      ),
      shouldUpdate: json['shouldUpdate'] as bool? ?? false,
      requiresUpdate: json['requiresUpdate'] as bool? ?? false,
    );
  }

  final String platform;
  final String currentVersion;
  final String? effectiveVersion;
  final String? minimumVersion;
  final bool otpEnabled;
  final String? storeUrl;
  final MobileUpdateStatus status;
  final bool shouldUpdate;
  final bool requiresUpdate;
}
