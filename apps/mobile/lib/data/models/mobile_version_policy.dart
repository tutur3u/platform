import 'package:equatable/equatable.dart';

String? _normalizeOptionalString(String? value) {
  final trimmed = value?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}

class MobilePlatformVersionPolicy extends Equatable {
  const MobilePlatformVersionPolicy({
    this.effectiveVersion,
    this.minimumVersion,
    this.otpEnabled = false,
    this.storeUrl,
  });

  factory MobilePlatformVersionPolicy.fromJson(Map<String, dynamic> json) {
    return MobilePlatformVersionPolicy(
      effectiveVersion: _normalizeOptionalString(
        json['effectiveVersion'] as String?,
      ),
      minimumVersion: _normalizeOptionalString(
        json['minimumVersion'] as String?,
      ),
      otpEnabled: json['otpEnabled'] as bool? ?? false,
      storeUrl: _normalizeOptionalString(json['storeUrl'] as String?),
    );
  }

  final String? effectiveVersion;
  final String? minimumVersion;
  final bool otpEnabled;
  final String? storeUrl;

  Map<String, dynamic> toJson() => {
    'effectiveVersion': _normalizeOptionalString(effectiveVersion),
    'minimumVersion': _normalizeOptionalString(minimumVersion),
    'otpEnabled': otpEnabled,
    'storeUrl': _normalizeOptionalString(storeUrl),
  };

  MobilePlatformVersionPolicy normalized() {
    return MobilePlatformVersionPolicy(
      effectiveVersion: _normalizeOptionalString(effectiveVersion),
      minimumVersion: _normalizeOptionalString(minimumVersion),
      otpEnabled: otpEnabled,
      storeUrl: _normalizeOptionalString(storeUrl),
    );
  }

  @override
  List<Object?> get props => [
    effectiveVersion,
    minimumVersion,
    otpEnabled,
    storeUrl,
  ];
}

class MobileVersionPolicies extends Equatable {
  const MobileVersionPolicies({
    required this.ios,
    required this.android,
    this.webOtpEnabled = false,
  });

  factory MobileVersionPolicies.empty() {
    return const MobileVersionPolicies(
      ios: MobilePlatformVersionPolicy(),
      android: MobilePlatformVersionPolicy(),
    );
  }

  factory MobileVersionPolicies.fromJson(Map<String, dynamic> json) {
    return MobileVersionPolicies(
      ios: MobilePlatformVersionPolicy.fromJson(
        (json['ios'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      android: MobilePlatformVersionPolicy.fromJson(
        (json['android'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      webOtpEnabled: json['webOtpEnabled'] as bool? ?? false,
    );
  }

  final MobilePlatformVersionPolicy ios;
  final MobilePlatformVersionPolicy android;
  final bool webOtpEnabled;

  Map<String, dynamic> toJson() => {
    'ios': ios.normalized().toJson(),
    'android': android.normalized().toJson(),
    'webOtpEnabled': webOtpEnabled,
  };

  MobileVersionPolicies normalized() {
    return MobileVersionPolicies(
      ios: ios.normalized(),
      android: android.normalized(),
      webOtpEnabled: webOtpEnabled,
    );
  }

  @override
  List<Object?> get props => [ios, android, webOtpEnabled];
}
