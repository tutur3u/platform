part of 'assistant_reset_preferences.dart';

/// Evidence of a first-message creation that was sent but never confirmed.
///
/// Only a recorded attempt (or an unresolved pre-envelope creation marker)
/// counts. Conservative holds from reads, migrations or resets carry no
/// attempt, so they neither show the unsaved-chat notice nor survive the
/// next workspace load.
extension AssistantCreationNotice on AssistantResetPreferences {
  static const legacyAttempt = 'legacy';

  /// The unresolved attempt id, [legacyAttempt] for a pre-envelope marker, or
  /// null when no send is waiting on a creation receipt. Read-only.
  Future<String?> unresolvedCreationAttempt() =>
      AssistantResetPreferences.serialized(key, () async {
        try {
          final prefs = await SharedPreferences.getInstance();
          _check();
          final value = await _read(prefs);
          if (value != null) return value.held ? value.attemptId : null;
          return _legacyCreationUnknown(prefs) ? legacyAttempt : null;
        } on Object {
          return null;
        }
      });

  bool _legacyCreationUnknown(SharedPreferences prefs) {
    final marker = '$actorId::mira-chat-creation::$workspaceId';
    return prefs.containsKey(marker) && prefs.get(marker) != 'clear:v1';
  }

  /// A hold that records no attempt: nothing was sent, so it is released.
  bool _attemptless(SharedPreferences prefs, AssistantResetEnvelope value) =>
      value.held &&
      !value.pending &&
      value.attemptId == null &&
      !AssistantResetPreferences._holds.contains(key) &&
      !_legacyCreationUnknown(prefs);
}
