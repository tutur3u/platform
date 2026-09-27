import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';

enum NoteDeviceLockMethod { biometrics, pin }

class NoteDeviceCredential {
  const NoteDeviceCredential({
    required this.secret,
    required this.lockId,
    required this.method,
    this.pinSalt,
    this.pinHash,
    this.failedAttempts = 0,
    this.blockedUntil,
  });

  final String secret;
  final String lockId;
  final NoteDeviceLockMethod method;
  final String? pinSalt;
  final String? pinHash;
  final int failedAttempts;
  final DateTime? blockedUntil;

  Map<String, dynamic> toJson() => {
    'secret': secret,
    'lockId': lockId,
    'method': method.name,
    'pinSalt': pinSalt,
    'pinHash': pinHash,
    'failedAttempts': failedAttempts,
    'blockedUntil': blockedUntil?.toIso8601String(),
  };

  static NoteDeviceCredential? fromJson(String? raw) {
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final secret = json['secret'];
      final lockId = json['lockId'];
      final method = NoteDeviceLockMethod.values
          .where((value) => value.name == json['method'])
          .firstOrNull;
      if (secret is! String || lockId is! String || method == null) return null;
      return NoteDeviceCredential(
        secret: secret,
        lockId: lockId,
        method: method,
        pinSalt: json['pinSalt'] as String?,
        pinHash: json['pinHash'] as String?,
        failedAttempts: json['failedAttempts'] as int? ?? 0,
        blockedUntil: DateTime.tryParse(json['blockedUntil'] as String? ?? ''),
      );
    } on Object {
      return null;
    }
  }
}

/// Device-only secrets are scoped to both the signed-in account and note.
/// The six-digit PIN gates use of the stored key; it never derives the
/// note encryption key, so a copied ciphertext cannot be brute-forced by PIN.
class NoteDeviceLockService {
  NoteDeviceLockService({
    FlutterSecureStorage? storage,
    LocalAuthService? localAuth,
    String? Function()? userId,
    DateTime Function()? now,
  }) : _storage =
           storage ??
           const FlutterSecureStorage(
             iOptions: IOSOptions(
               accessibility: KeychainAccessibility.unlocked_this_device,
               accountName: 'tuturuuu.note-lock',
             ),
           ),
       _localAuth = localAuth ?? DeviceLocalAuthService(biometricOnly: true),
       _userId = userId ?? currentCacheUserId,
       _now = now ?? DateTime.now;

  final FlutterSecureStorage _storage;
  final LocalAuthService _localAuth;
  final String? Function() _userId;
  final DateTime Function() _now;

  String _key(String wsId, String noteId) {
    final userId = _userId();
    if (userId == null || userId.isEmpty) {
      throw StateError('A signed-in account is required for note locking');
    }
    return 'note-lock.v1.$userId.$wsId.$noteId';
  }

  Future<bool> canAuthenticate() => _localAuth.isDeviceSupported();

  Future<bool> authenticate({required String reason}) =>
      _localAuth.authenticate(reason: reason);

  String createSecret() {
    final random = Random.secure();
    return base64Encode(List<int>.generate(32, (_) => random.nextInt(256)));
  }

  String createLockId() => createSecret();

  Future<NoteDeviceCredential?> _read(String wsId, String noteId) async =>
      NoteDeviceCredential.fromJson(
        await _storage.read(key: _key(wsId, noteId)),
      );

  Future<NoteDeviceLockMethod?> method(
    String wsId,
    String noteId, {
    required String? lockId,
  }) async {
    final credential = await _read(wsId, noteId);
    return credential?.lockId == lockId ? credential?.method : null;
  }

  Future<void> save(
    String wsId,
    String noteId,
    String secret, {
    required String lockId,
    String? pin,
  }) async {
    String? salt;
    String? hash;
    if (pin != null) {
      if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
        throw ArgumentError('PIN must have six digits');
      }
      final random = Random.secure();
      salt = base64Encode(List<int>.generate(16, (_) => random.nextInt(256)));
      hash = await _pinHash(pin, salt);
    }
    await _write(
      wsId,
      noteId,
      NoteDeviceCredential(
        secret: secret,
        lockId: lockId,
        method: pin == null
            ? NoteDeviceLockMethod.biometrics
            : NoteDeviceLockMethod.pin,
        pinSalt: salt,
        pinHash: hash,
      ),
    );
  }

  Future<String?> unlock(
    String wsId,
    String noteId, {
    required String reason,
    required String? lockId,
    String? pin,
  }) async {
    final credential = await _read(wsId, noteId);
    if (credential == null || credential.lockId != lockId) return null;
    if (credential.method == NoteDeviceLockMethod.biometrics) {
      return await authenticate(reason: reason) ? credential.secret : null;
    }
    if (pin == null ||
        credential.pinHash == null ||
        credential.pinSalt == null ||
        (credential.blockedUntil?.isAfter(_now()) ?? false)) {
      return null;
    }
    final candidate = await _pinHash(pin, credential.pinSalt!);
    if (!_constantTimeEquals(candidate, credential.pinHash!)) {
      final failures = credential.failedAttempts + 1;
      await _write(
        wsId,
        noteId,
        NoteDeviceCredential(
          secret: credential.secret,
          lockId: credential.lockId,
          method: credential.method,
          pinSalt: credential.pinSalt,
          pinHash: credential.pinHash,
          failedAttempts: failures,
          blockedUntil: failures >= 5
              ? _now().add(const Duration(seconds: 30))
              : null,
        ),
      );
      return null;
    }
    if (credential.failedAttempts != 0) {
      await _write(
        wsId,
        noteId,
        NoteDeviceCredential(
          secret: credential.secret,
          lockId: credential.lockId,
          method: credential.method,
          pinSalt: credential.pinSalt,
          pinHash: credential.pinHash,
        ),
      );
    }
    return credential.secret;
  }

  Future<void> delete(String wsId, String noteId) =>
      _storage.delete(key: _key(wsId, noteId));

  Future<void> _write(
    String wsId,
    String noteId,
    NoteDeviceCredential credential,
  ) => _storage.write(
    key: _key(wsId, noteId),
    value: jsonEncode(credential.toJson()),
  );

  Future<String> _pinHash(String pin, String salt) async {
    final key = await Pbkdf2(
      macAlgorithm: Hmac.sha256(),
      iterations: 150000,
      bits: 256,
    ).deriveKeyFromPassword(password: pin, nonce: base64Decode(salt));
    return base64Encode(await key.extractBytes());
  }

  bool _constantTimeEquals(String a, String b) {
    final left = utf8.encode(a);
    final right = utf8.encode(b);
    if (left.length != right.length) return false;
    var difference = 0;
    for (var i = 0; i < left.length; i++) {
      difference |= left[i] ^ right[i];
    }
    return difference == 0;
  }
}
