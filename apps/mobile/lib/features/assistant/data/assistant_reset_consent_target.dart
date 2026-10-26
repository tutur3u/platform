part of 'assistant_reset_preferences.dart';

/// Read-only inspection capability. It is issued and consumed in this process,
/// never persisted and never an authorization for creation or restart recovery.
final class AssistantResetConsentTarget {
  AssistantResetConsentTarget._({
    required this.actorId,
    required this.workspaceId,
    required this.requiresConsent,
    required bool hadEnvelope,
    required String identity,
    required bool Function() isCurrent,
  }) : _hadEnvelope = hadEnvelope,
       _identity = identity,
       _isCurrent = isCurrent;

  final String actorId;
  final String workspaceId;
  final bool requiresConsent;
  final bool _hadEnvelope;
  final String _identity;
  final bool Function() _isCurrent;
  static final _issued = <String, AssistantResetConsentTarget>{};
}

extension AssistantResetConsentInspection on AssistantResetPreferences {
  /// Reads fresh authority under the reset lock without writing preferences,
  /// consuming creation permission, or publishing shell/live state.
  Future<AssistantResetConsentTarget?> inspectResetConsentTarget() =>
      AssistantResetPreferences.serialized(key, () async {
        try {
          _check();
          final prefs = await SharedPreferences.getInstance();
          _check();
          final old = await _read(prefs);
          final value = old ?? _legacy(prefs);
          final target = AssistantResetConsentTarget._(
            actorId: actorId,
            workspaceId: workspaceId,
            requiresConsent: !_canCreate(value),
            hadEnvelope: old != null,
            identity: _consentIdentity(prefs, old, value),
            isCurrent: isCurrent,
          );
          _check();
          AssistantResetConsentTarget._issued[key] = target;
          return target;
        } on Object {
          AssistantResetConsentTarget._issued.remove(key);
          return null;
        }
      });

  // Every successful fresh read fences an observed ABA. Invalidating a target
  // changes neither the returned authority nor creation tickets/process holds.
  void _observeConsentAuthority(
    SharedPreferences prefs,
    AssistantResetEnvelope? value,
  ) {
    final target = AssistantResetConsentTarget._issued[key];
    if (target == null) return;
    try {
      if (target._isCurrent() &&
          target._identity ==
              _consentIdentity(prefs, value, value ?? _legacy(prefs))) {
        return;
      }
    } on Object {
      // Unreadable legacy fallback invalidates consent without changing the
      // existing successful canonical-absent read's null return semantics.
    }
    AssistantResetConsentTarget._issued.remove(key);
  }

  String _legacyDigest(SharedPreferences prefs, {bool bindPresence = false}) {
    final keys = [
      '$actorId::mira-dashboard-chat-$workspaceId',
      '$actorId::mira-dashboard-workspace-context-$workspaceId',
      '$actorId::mira-chat-creation::$workspaceId',
    ];
    // getString rejects wrongly typed values. Presence distinguishes absence
    // from every readable beforeimage; only the digest leaves this method.
    return sha256
        .convert(
          utf8.encode(
            jsonEncode([
              for (final key in keys)
                if (bindPresence)
                  [prefs.containsKey(key), prefs.getString(key)]
                else
                  prefs.getString(key),
            ]),
          ),
        )
        .toString();
  }

  String _consentIdentity(
    SharedPreferences prefs,
    AssistantResetEnvelope? old,
    AssistantResetEnvelope value,
  ) {
    final ticket = AssistantResetPreferences._tickets[key];
    return sha256
        .convert(
          utf8.encode(
            jsonEncode([
              actorId,
              workspaceId,
              value._value,
              if (old == null) _legacyDigest(prefs, bindPresence: true),
              AssistantResetPreferences._holds.contains(key),
              _canCreate(value),
              if (ticket != null)
                [ticket.operationId, ticket.generation, ticket.revision],
            ]),
          ),
        )
        .toString();
  }
}
