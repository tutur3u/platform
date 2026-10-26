import 'dart:convert';

import 'package:mobile/data/sources/api_client.dart';

/// Workspaces the signed-in user pinned to Home's chip row.
///
/// Stored per user (not per device) in `user_configs` through the existing
/// `/api/v1/users/me/configs` route as an ordered JSON array of workspace
/// IDs. Pins are private to the user and never shared.
class WorkspacePinsRepository {
  WorkspacePinsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const configId = 'MOBILE_PINNED_WORKSPACES';
  static const _path = '/api/v1/users/me/configs/$configId';

  final ApiClient _api;

  /// The stored pins in order. Malformed values read as no pins.
  Future<List<String>> load() async {
    final data = await _api.getJson(_path);
    return decode(data['value']);
  }

  /// Replaces the stored pins; an empty list clears the config.
  Future<void> save(List<String> workspaceIds) async {
    final ids = workspaceIds.toSet().toList(growable: false);
    await _api.putJson(_path, {'value': ids.isEmpty ? null : jsonEncode(ids)});
  }

  static List<String> decode(Object? raw) {
    if (raw is! String || raw.trim().isEmpty) return const [];
    try {
      final value = jsonDecode(raw);
      if (value is! List) return const [];
      return value.whereType<String>().toSet().toList(growable: false);
    } on FormatException {
      return const [];
    }
  }
}
