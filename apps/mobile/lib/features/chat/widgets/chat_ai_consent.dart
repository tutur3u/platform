import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_sheet.dart';

/// The app's Mira AI data consent, when the app provides it.
MiraAiConsentController? chatAiConsentController(BuildContext context) =>
    context.read<MiraAiConsentProvision?>()?.controller;

/// Resolves whether a send in an AI conversation may reach Google Gemini,
/// asking the user when needed. Without a provided controller the send goes
/// on, and the server still refuses one it does not allow.
Future<bool> ensureChatAiConsent(BuildContext context) async {
  final controller = chatAiConsentController(context);
  if (controller == null || controller.granted) return true;
  return await ensureMiraAiConsent(context, controller);
}

/// The server refused an AI send for missing consent: forget the cached
/// grant and ask again. The refused send stays in the composer.
void askChatAiConsentAgain(BuildContext context) {
  final controller = chatAiConsentController(context);
  if (controller == null) return;
  controller.consentRequired();
  if (context.mounted) unawaited(ensureMiraAiConsent(context, controller));
}
