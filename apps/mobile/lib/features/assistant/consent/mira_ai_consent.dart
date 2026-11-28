import 'package:equatable/equatable.dart';
import 'package:mobile/data/sources/api_exception.dart';

/// The policy text version the consent sheet and Settings row present.
const miraAiConsentPolicyVersion = '2026-11-28';

/// The server code for a Mira send refused for missing AI data consent.
const miraAiConsentRequiredCode = 'ai_consent_required';

/// Where a consent answer was given, recorded with the server row.
enum MiraAiConsentSource {
  miraPrompt('mobile_mira_prompt'),
  settings('mobile_settings');

  const MiraAiConsentSource(this.code);
  final String code;
}

/// One user's answer about sharing Mira content with Google Gemini.
class MiraAiConsent extends Equatable {
  const MiraAiConsent({
    required this.granted,
    this.policyVersion,
    this.grantedAt,
    this.withdrawnAt,
  });

  factory MiraAiConsent.fromJson(Map<String, dynamic> json) => MiraAiConsent(
    // Anything but an explicit true is no consent.
    granted: json['granted'] == true,
    policyVersion: json['policyVersion'] is String
        ? json['policyVersion'] as String
        : null,
    grantedAt: _date(json['grantedAt']),
    withdrawnAt: _date(json['withdrawnAt']),
  );

  static const denied = MiraAiConsent(granted: false);

  final bool granted;
  final String? policyVersion;
  final DateTime? grantedAt;
  final DateTime? withdrawnAt;

  static DateTime? _date(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;

  @override
  List<Object?> get props => [granted, policyVersion, grantedAt, withdrawnAt];
}

/// Whether [error] is the server refusing a Mira send for missing consent.
bool isMiraAiConsentRequired(Object? error) =>
    error is ApiException &&
    error.statusCode == 403 &&
    (error.code == miraAiConsentRequiredCode ||
        error.message == miraAiConsentRequiredCode);

/// The consent check cubits run before any Mira upload or request.
///
/// [granted] answers from the cached server decision without waiting, so an
/// already-consented send keeps its timing. [request] asks the user and
/// resolves true only after the server stored an Allow. [consentRequired]
/// forgets a cached grant the server no longer honours.
abstract interface class MiraAiConsentGate {
  bool get granted;
  Future<bool> request();
  void consentRequired();
}
