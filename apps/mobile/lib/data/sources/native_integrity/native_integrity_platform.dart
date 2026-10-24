import 'dart:convert';

import 'package:app_attest/app_attest.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_turnstile.dart';

enum IntegrityPlatformKind { apple, android, other }

abstract interface class NativeIntegrityPlatform {
  Future<IntegrityPlatformKind> kind();
  Future<String> appleKey(String scope);
  Future<bool> isEnrolled(String scope, String keyId);
  Future<void> markEnrolled(String scope, String keyId);
  Future<String> attest(String keyId, String requestHash);
  Future<String> assertion(String keyId, String requestHash);
  Future<String> playIntegrity(String project, String requestHash);
  Future<String> turnstile(Uri url, String requestHash);
}

class DeviceIntegrityPlatform implements NativeIntegrityPlatform {
  static const _channel = MethodChannel('mobile/native_integrity');
  static const _storage = FlutterSecureStorage();
  final _keyScopes = <String, String>{};
  static String? _preparedProject;
  static Future<void>? _preparing;

  @override
  Future<IntegrityPlatformKind> kind() async {
    if (kIsWeb) return IntegrityPlatformKind.other;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return IntegrityPlatformKind.android;
    }
    if ((defaultTargetPlatform == TargetPlatform.iOS ||
            defaultTargetPlatform == TargetPlatform.macOS) &&
        await _channel
                .invokeMethod<bool>('supported')
                .timeout(const Duration(seconds: 3)) ==
            true) {
      return IntegrityPlatformKind.apple;
    }
    return IntegrityPlatformKind.other;
  }

  String _key(String scope) =>
      'native-integrity.${sha256.convert(utf8.encode(scope))}';

  @override
  Future<String> appleKey(String scope) async {
    final stored = await _storage.read(key: _key(scope));
    final enrolled = await _storage.read(key: '${_key(scope)}.enrolled');
    final attempted = await _storage.read(key: '${_key(scope)}.attested');
    final rawAge = await _storage.read(key: '${_key(scope)}.created');
    final created = int.tryParse(rawAge ?? '');
    if (stored != null &&
        (enrolled == stored || attempted != stored) &&
        created != null &&
        DateTime.now().millisecondsSinceEpoch - created <
            const Duration(days: 30).inMilliseconds) {
      _keyScopes[stored] = scope;
      return stored;
    }
    final key = await _channel
        .invokeMethod<String>('generateKey')
        .timeout(const Duration(seconds: 15));
    if (key == null || key.isEmpty) throw StateError('Missing App Attest key');
    await _storage.write(key: _key(scope), value: key);
    await _storage.write(
      key: '${_key(scope)}.created',
      value: '${DateTime.now().millisecondsSinceEpoch}',
    );
    await _storage.delete(key: '${_key(scope)}.enrolled');
    _keyScopes[key] = scope;
    return key;
  }

  @override
  Future<bool> isEnrolled(String scope, String keyId) async =>
      await _storage.read(key: '${_key(scope)}.enrolled') == keyId;

  @override
  Future<void> markEnrolled(String scope, String keyId) =>
      _storage.write(key: '${_key(scope)}.enrolled', value: keyId);

  Future<String> _apple(String method, String key, String hash) async {
    final value = await _channel
        .invokeMethod<String>(method, {'keyId': key, 'requestHash': hash})
        .timeout(const Duration(seconds: 15));
    if (value == null || value.isEmpty) throw StateError('Missing Apple proof');
    return value;
  }

  @override
  Future<String> attest(String keyId, String requestHash) async {
    final scope = _keyScopes[keyId];
    if (scope == null) throw StateError('Unknown key scope');
    await _storage.write(key: '${_key(scope)}.attested', value: keyId);
    return await _apple('attestKey', keyId, requestHash);
  }

  @override
  Future<String> assertion(String keyId, String requestHash) =>
      _apple('generateAssertion', keyId, requestHash);

  @override
  Future<String> playIntegrity(String project, String requestHash) async {
    if (_preparedProject != project) {
      _preparing ??=
          AppAttest.preparePlayIntegrityTokenProvider(
                cloudProjectNumber: int.parse(project),
              )
              .then((_) {
                _preparedProject = project;
              })
              .whenComplete(() {
                _preparing = null;
              });
      await _preparing!.timeout(const Duration(seconds: 15));
      if (_preparedProject != project) {
        throw StateError('Integrity project changed');
      }
    }
    return await AppAttest.requestStandardPlayIntegrityToken(
      requestHash: requestHash,
    ).timeout(const Duration(seconds: 15));
  }

  @override
  Future<String> turnstile(Uri url, String requestHash) =>
      requestIntegrityTurnstile(url, requestHash);
}
