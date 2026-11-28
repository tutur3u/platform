import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_sheet.dart';

/// The Meet room's consent gate: the cached server answer, and the
/// disclosure sheet when the user has not allowed sharing yet.
///
/// The sheet opens on the root navigator, above the app shell and the Meet
/// chat sheet, from whichever room control asked.
class MeetAiConsentGate implements MiraAiConsentGate {
  MeetAiConsentGate(this._owner, this._controller);

  final State<StatefulWidget> _owner;
  final MiraAiConsentController _controller;

  @override
  bool get granted => _controller.granted;

  @override
  Future<bool> request() async {
    final context = _sheetContext();
    if (context == null) return false;
    return await ensureMiraAiConsent(context, _controller);
  }

  @override
  void consentRequired() {
    _controller.consentRequired();
    // Ask again at once; the refused request is not sent again by itself.
    unawaited(request());
  }

  BuildContext? _sheetContext() {
    if (!_owner.mounted) return null;
    return Navigator.maybeOf(_owner.context, rootNavigator: true)?.context;
  }
}

/// The consent gate for a Meet room page, when the app provides Mira AI
/// consent. Without one the room sends as before.
MeetAiConsentGate? meetAiConsentGate(State<StatefulWidget> owner) {
  final context = owner.context;
  final controller = context.read<MiraAiConsentProvision?>()?.controller;
  return controller == null ? null : MeetAiConsentGate(owner, controller);
}
