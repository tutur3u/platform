import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';

/// The error a Meet Mira request records when it waits on AI data consent:
/// the user chose Not now, or the server refused for missing consent.
const meetAiConsentRequiredError = miraAiConsentRequiredCode;

/// Resolves whether a Meet Mira request may reach Google Gemini, asking the
/// user when needed. Without a gate the request goes on, and the server still
/// refuses one it does not allow.
Future<bool> admitMeetAiConsent(MiraAiConsentGate? gate) async {
  if (gate == null || gate.granted) return true;
  return await gate.request();
}
