import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/totp.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DeviceMfaCredential {
  const DeviceMfaCredential({
    required this.factorId,
    required this.secret,
    this.verified = false,
    this.proof = '',
  });
  final String factorId;
  final String secret;
  final bool verified;
  final String proof;
}

/// Credentials are scoped to the account and never go into preferences/cache.
/// Retaining them across sign-out lets this device verify a new login.
class DeviceMfaStore {
  DeviceMfaStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.unlocked_this_device,
              accountName: 'tuturuuu.device-mfa',
            ),
          );
  final FlutterSecureStorage _storage;
  String _key(String userId) => 'device-mfa.v1.$userId';

  Future<DeviceMfaCredential?> read(String userId) async {
    final value = await _storage.read(key: _key(userId));
    if (value == null) return null;
    final json = jsonDecode(value) as Map<String, dynamic>;
    return DeviceMfaCredential(
      factorId: json['factorId'] as String,
      secret: json['secret'] as String,
      verified: json['verified'] == true,
      proof: json['proof'] as String? ?? '',
    );
  }

  Future<void> write(String userId, DeviceMfaCredential credential) =>
      _storage.write(
        key: _key(userId),
        value: jsonEncode({
          'factorId': credential.factorId,
          'secret': credential.secret,
          'verified': credential.verified,
          'proof': credential.proof,
        }),
      );

  Future<void> delete(String userId) => _storage.delete(key: _key(userId));
}

class DeviceMfaService {
  DeviceMfaService({
    SupabaseClient? client,
    DeviceMfaStore? store,
    LocalAuthService? localAuth,
    DeviceMfaRepository? repository,
    DateTime Function()? now,
  }) : _client = client ?? Supabase.instance.client,
       _store = store ?? DeviceMfaStore(),
       _localAuth = localAuth ?? DeviceLocalAuthService(),
       _now = now ?? DateTime.now,
       _repository = repository ?? DeviceMfaRepository();

  final DeviceMfaRepository _repository;
  final SupabaseClient _client;
  final DeviceMfaStore _store;
  final LocalAuthService _localAuth;
  final DateTime Function() _now;
  bool _busy = false;

  String get _userId {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw const AuthException('Authentication required');
    return id;
  }

  void _checkUser(String userId) {
    if (_client.auth.currentUser?.id != userId) {
      throw const AuthException('Account changed. Please try again.');
    }
  }

  Future<bool> isRegistered() async =>
      (await _store.read(_userId))?.verified ?? false;

  Future<void> _unlock(String userId, String reason) async {
    if (!await _localAuth.authenticate(reason: reason)) {
      throw const AuthException(
        'Device verification cancelled',
        code: 'device_verification_cancelled',
      );
    }
    _checkUser(userId);
  }

  /// Persist before verifying: a storage failure must never activate a factor
  /// whose secret the user cannot recover. An interrupted setup is resumable.
  Future<void> enroll({required String name, required String reason}) async {
    if (_busy) throw const AuthException('Verification already in progress');
    _busy = true;
    try {
      final userId = _userId;
      await _unlock(userId, reason);
      var credential = await _store.read(userId);
      _checkUser(userId);
      if (credential != null) {
        final existing = await _client.auth.mfa.listFactors();
        _checkUser(userId);
        if (!existing.all.any((factor) => factor.id == credential!.factorId)) {
          // Another trusted device may have revoked this enrollment. A fresh
          // provider read is required before discarding the local credential.
          await _store.delete(userId);
          _checkUser(userId);
          credential = null;
        }
      }
      if (credential == null) {
        final assurance = _client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.currentLevel != AuthenticatorAssuranceLevels.aal2 &&
            assurance.nextLevel == AuthenticatorAssuranceLevels.aal2) {
          throw const AuthException(
            'Verify an existing authenticator before registering this device',
            code: 'existing_mfa_required',
          );
        }
        final enrolled = await _repository.change({
          'action': 'enroll',
          'name': name.trim(),
        });
        _checkUser(userId);
        credential = DeviceMfaCredential(
          factorId: enrolled['factorId'] as String,
          secret: enrolled['secret'] as String,
          proof: enrolled['proof'] as String,
        );
        try {
          await _store.write(userId, credential);
        } on Object {
          await _repository.change({'action': 'cancel', ..._proof(credential)});
          rethrow;
        }
      }
      _checkUser(userId);
      final factors = await _client.auth.mfa.listFactors();
      _checkUser(userId);
      final alreadyVerified = factors.totp.any(
        (factor) =>
            factor.id == credential!.factorId &&
            factor.status == FactorStatus.verified,
      );
      if (!alreadyVerified ||
          _client.auth.mfa.getAuthenticatorAssuranceLevel().currentLevel !=
              AuthenticatorAssuranceLevels.aal2) {
        await _verify(credential);
      }
      _checkUser(userId);
      await _repository.change({'action': 'confirm', ..._proof(credential)});
      _checkUser(userId);
      await _store.write(
        userId,
        DeviceMfaCredential(
          factorId: credential.factorId,
          secret: credential.secret,
          verified: true,
          proof: credential.proof,
        ),
      );
    } finally {
      _busy = false;
    }
  }

  Future<void> _verify(DeviceMfaCredential credential) async {
    await _client.auth.mfa.challengeAndVerify(
      factorId: credential.factorId,
      code: deviceTotp(credential.secret, _now()),
    );
  }

  /// Fresh local verification precedes each approval, even for an AAL2 session.
  Future<void> verify({required String reason}) async {
    final userId = _userId;
    await _unlock(userId, reason);
    final credential = await _store.read(userId);
    _checkUser(userId);
    if (credential == null || !credential.verified) {
      throw const AuthException(
        'Register this device as an authenticator first',
      );
    }
    if (_client.auth.mfa.getAuthenticatorAssuranceLevel().currentLevel !=
        AuthenticatorAssuranceLevels.aal2) {
      await _verify(credential);
    }
    _checkUser(userId);
  }

  Future<String> code({required String reason}) async {
    final userId = _userId;
    await _unlock(userId, reason);
    final credential = await _store.read(userId);
    _checkUser(userId);
    if (credential == null || !credential.verified) {
      throw const AuthException('Device not registered');
    }
    return deviceTotp(credential.secret, _now());
  }

  Future<void> remove({required String reason}) async {
    final userId = _userId;
    await verify(reason: reason);
    _checkUser(userId);
    final credential = await _store.read(userId);
    _checkUser(userId);
    if (credential == null) return;
    // Keep the secret if the server refuses revocation or the network fails.
    await _repository.change({
      'action': 'remove',
      ..._proof(credential),
      'targetFactorId': credential.factorId,
    });
    _checkUser(userId);
    await _store.delete(userId);
  }

  Map<String, String> _proof(DeviceMfaCredential credential) => {
    'factorId': credential.factorId,
    'proof': credential.proof,
  };

  Future<({DeviceMfaRegistry registry, String? currentFactorId})>
  status() async {
    final userId = _userId;
    final registry = await _repository.load();
    final credential = await _store.read(userId);
    _checkUser(userId);
    return (registry: registry, currentFactorId: credential?.factorId);
  }

  Future<Map<String, String>> approvalProof({required String reason}) async {
    final userId = _userId;
    await verify(reason: reason);
    final credential = await _store.read(userId);
    _checkUser(userId);
    if (credential == null || credential.proof.isEmpty) {
      throw const AuthException('Register this device first');
    }
    return _proof(credential);
  }

  Future<void> setRegistrationLock({
    required bool locked,
    required String reason,
  }) async {
    final userId = _userId;
    final proof = await approvalProof(reason: reason);
    _checkUser(userId);
    await _repository.change({'action': 'policy', ...proof, 'locked': locked});
    _checkUser(userId);
  }

  Future<void> removeTrustedDevice(
    String factorId, {
    required String reason,
  }) async {
    final userId = _userId;
    final proof = await approvalProof(reason: reason);
    _checkUser(userId);
    await _repository.change({
      'action': 'remove',
      ...proof,
      'targetFactorId': factorId,
    });
    _checkUser(userId);
    if (proof['factorId'] == factorId) await _store.delete(userId);
  }
}
