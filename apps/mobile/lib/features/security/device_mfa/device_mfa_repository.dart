import 'package:mobile/data/sources/api_client.dart';

class TrustedAuthenticator {
  const TrustedAuthenticator({
    required this.factorId,
    required this.name,
    required this.verified,
    required this.createdAt,
  });
  factory TrustedAuthenticator.fromJson(Map<String, dynamic> json) =>
      TrustedAuthenticator(
        factorId: json['factorId'] as String,
        name: json['name'] as String,
        verified: json['verified'] == true,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
  final String factorId;
  final String name;
  final bool verified;
  final DateTime createdAt;
}

class DeviceMfaRegistry {
  const DeviceMfaRegistry({required this.locked, required this.devices});
  factory DeviceMfaRegistry.fromJson(Map<String, dynamic> json) =>
      DeviceMfaRegistry(
        locked: json['locked'] == true,
        devices: (json['devices'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(TrustedAuthenticator.fromJson)
            .toList(growable: false),
      );
  final bool locked;
  final List<TrustedAuthenticator> devices;
}

class DeviceMfaRepository {
  DeviceMfaRepository({ApiClient? api}) : _api = api ?? ApiClient();
  final ApiClient _api;
  static const _path = '/api/v1/auth/mfa/devices';
  Future<DeviceMfaRegistry> load() async =>
      DeviceMfaRegistry.fromJson(await _api.getJson(_path));
  Future<Map<String, dynamic>> change(Map<String, dynamic> input) =>
      _api.postJson(_path, input);
}
