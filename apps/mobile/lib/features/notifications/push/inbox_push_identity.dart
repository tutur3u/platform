import 'dart:convert';

/// Persisted row identity. This is metadata, never API/action authorization.
class InboxPushIdentity {
  const InboxPushIdentity._(
    this.capsule,
    this.actorId,
    this.workspaceId,
    this.id,
  );

  final String capsule;
  final String actorId;
  final String? workspaceId;
  final String id;
  static const prefix = 'tuturuuu:inbox:v1:';
  static final _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  );

  static InboxPushIdentity? parse(Object? value) {
    if (value is! String || value.length > 256 || !value.startsWith(prefix)) {
      return null;
    }
    try {
      final encoded = value.substring(prefix.length);
      final bytes = base64Url.decode(base64Url.normalize(encoded));
      if (base64Url.encode(bytes).replaceAll('=', '') != encoded) return null;
      final tuple = jsonDecode(utf8.decode(bytes));
      if (tuple is! List || tuple.length != 3) return null;
      final actor = tuple[0];
      final workspace = tuple[1];
      final id = tuple[2];
      if (actor is! String || !_uuid.hasMatch(actor)) return null;
      if (id is! String || !_uuid.hasMatch(id)) return null;
      if (workspace != null &&
          (workspace is! String || !_uuid.hasMatch(workspace))) {
        return null;
      }
      // Require canonical producer JSON, not alternative spellings.
      if (jsonEncode(tuple) != utf8.decode(bytes)) return null;
      return InboxPushIdentity._(value, actor, workspace as String?, id);
    } on FormatException {
      return null;
    }
  }
}
