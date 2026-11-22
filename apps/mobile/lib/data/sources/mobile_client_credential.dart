import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:math' as math;

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/device_secure_storage.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_turnstile.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Header that carries the native mobile client credential next to the
/// Supabase bearer. It is not an auth token: the server only uses it to clear
/// the browser-shape mutation heuristic for this user's Supabase session.
const mobileClientHeader = 'x-tuturuuu-mobile-client';
const mobileClientCredentialEndpoint = '/api/v1/auth/mobile/client-credential';
const mobileClientTurnstilePurpose = 'mobile_client_credential';
const _turnstilePath = '/native-integrity/turnstile';
const _storageKey = 'mobile-client-credentials.v1';
const _maxTokenLength = 4096;

typedef MobileClientTurnstile =
    Future<String> Function(Uri page, String binding);
typedef MobileClientMint =
    Future<Map<String, dynamic>> Function(String captchaToken);

/// Reads `session_id` from a Supabase access token whose subject is [userId].
String? supabaseSessionId(String? accessToken, String userId) {
  final parts = accessToken?.split('.');
  if (parts == null || parts.length != 3) return null;
  try {
    final claims = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    if (claims is! Map || claims['sub'] != userId) return null;
    final sessionId = claims['session_id'];
    return sessionId is String && sessionId.isNotEmpty ? sessionId : null;
  } on Object {
    return null;
  }
}

/// Unpadded base64url SHA-256 of the Supabase `session_id`. The mint endpoint
/// requires it as the Turnstile `cData`, which binds a solve to one session.
String mobileClientSessionBinding(String sessionId) => base64Url
    .encode(sha256.convert(utf8.encode(sessionId)).bytes)
    .replaceAll('=', '');

final class _Credential {
  const _Credential(this.token, this.binding, this.expiresAt);

  final String token;
  final String binding;
  final DateTime expiresAt;

  static _Credential? parse(Object? value, String binding) {
    if (value is! Map) return null;
    final token = value['token'];
    final expiresAt = DateTime.tryParse('${value['expires_at']}');
    if (token is! String ||
        token.isEmpty ||
        token.length > _maxTokenLength ||
        expiresAt == null) {
      return null;
    }
    return _Credential(token, binding, expiresAt.toUtc());
  }

  static _Credential? fromJson(Object? value) {
    if (value is! Map || value['binding'] is! String) return null;
    return parse(value, value['binding'] as String);
  }

  Map<String, String> toJson() => {
    'token': token,
    'binding': binding,
    'expires_at': expiresAt.toIso8601String(),
  };
}

/// Per-account store and minting policy for the native client credential.
///
/// Credentials live in device secure storage keyed by user id and are only
/// sent for the Supabase session they are bound to. Minting is single-flight
/// per session, refreshes ahead of expiry, and backs off exponentially after
/// a failure so a refused mint can never loop.
class MobileClientCredentials {
  MobileClientCredentials({
    FlutterSecureStorage? storage,
    MobileClientTurnstile? turnstile,
    DateTime Function()? clock,
    Duration storageTimeout = defaultStorageTimeout,
  }) : _storage = storage ?? deviceSecureStorage,
       _turnstile = turnstile ?? requestIntegrityTurnstile,
       _clock = clock ?? DateTime.now,
       _storageTimeout = storageTimeout;

  static MobileClientCredentials instance = MobileClientCredentials();

  static const refreshWindow = Duration(hours: 1);
  static const minBackoff = Duration(minutes: 1);
  static const maxBackoff = Duration(minutes: 30);

  /// How long a request waits on secure storage. A read or write that takes
  /// longer is abandoned for that request: it goes out without a credential,
  /// and the server's step-up drives the single replay instead of the
  /// request hanging before its HTTP timeout starts.
  static const defaultStorageTimeout = Duration(seconds: 3);

  /// A forced re-mint after a server rejection is allowed at most this often
  /// per account, so repeated step-ups cannot drive a mint per request.
  static const remintInterval = Duration(minutes: 2);

  final FlutterSecureStorage _storage;
  final MobileClientTurnstile _turnstile;
  final DateTime Function() _clock;
  final Duration _storageTimeout;

  Map<String, _Credential>? _entries;
  Future<void> _writes = Future<void>.value();
  final _inFlight = <String, Future<String?>>{};
  final _failures = <String, int>{};
  final _blockedUntil = <String, DateTime>{};
  final _lastAttempt = <String, DateTime>{};
  final _generation = <String, int>{};
  var _epoch = 0;
  StreamSubscription<AuthState>? _authChanges;

  DateTime get _now => _clock().toUtc();

  Future<Map<String, _Credential>> _load() async {
    final loaded = _entries;
    if (loaded != null) return loaded;
    final entries = <String, _Credential>{};
    try {
      final raw = await _storage.read(key: _storageKey);
      final decoded = raw == null ? null : jsonDecode(raw);
      if (decoded is Map) {
        for (final entry in decoded.entries) {
          final credential = _Credential.fromJson(entry.value);
          if (entry.key is String && credential != null) {
            entries[entry.key as String] = credential;
          }
        }
      }
    } on Object catch (error) {
      developer.log(
        'Mobile client credential read failed: ${error.runtimeType}',
        name: 'MobileClientCredentials',
      );
    }
    return _entries ??= entries;
  }

  /// The stored entries, or a [TimeoutException] when secure storage does
  /// not answer in time. A late read still completes and fills the cache;
  /// nothing empty is cached in its place, so stored credentials survive.
  Future<Map<String, _Credential>> _read() => _load().timeout(_storageTimeout);

  /// Waits for a write at most [_storageTimeout]. The write stays queued and
  /// may still land; the caller just stops waiting for it.
  Future<void> _settle(Future<void> write) async {
    try {
      await write.timeout(_storageTimeout);
    } on TimeoutException {
      developer.log(
        'Mobile client credential write timed out',
        name: 'MobileClientCredentials',
      );
    }
  }

  void _logReadTimeout() => developer.log(
    'Mobile client credential read timed out',
    name: 'MobileClientCredentials',
  );

  Future<void> _edit(void Function(Map<String, _Credential>) change) {
    final write = _writes.then((_) async {
      final entries = await _load();
      change(entries);
      try {
        if (entries.isEmpty) {
          await _storage.delete(key: _storageKey);
        } else {
          await _storage.write(
            key: _storageKey,
            value: jsonEncode({
              for (final entry in entries.entries)
                entry.key: entry.value.toJson(),
            }),
          );
        }
      } on Object catch (error) {
        developer.log(
          'Mobile client credential write failed: ${error.runtimeType}',
          name: 'MobileClientCredentials',
        );
      }
    });
    _writes = write;
    return write;
  }

  String? _bindingFor(String userId, String? accessToken) {
    final sessionId = supabaseSessionId(accessToken, userId);
    return sessionId == null ? null : mobileClientSessionBinding(sessionId);
  }

  Future<_Credential?> _valid(String userId, String binding) async {
    final credential = (await _read())[userId];
    if (credential == null) return null;
    if (credential.binding != binding) {
      // Bound to another Supabase session of this account; it can never verify.
      await _settle(_edit((entries) => entries.remove(userId)));
      return null;
    }
    return credential.expiresAt.isAfter(_now) ? credential : null;
  }

  /// The stored credential for this session, without minting.
  Future<String?> current({
    required String userId,
    required String? accessToken,
  }) async {
    final binding = _bindingFor(userId, accessToken);
    if (binding == null) return null;
    try {
      return (await _valid(userId, binding))?.token;
    } on TimeoutException {
      _logReadTimeout();
      return null;
    }
  }

  /// Returns a credential for this session, minting when it is missing or
  /// close to expiry. With [force], a server rejection of [rejected] drops it
  /// and re-mints once, subject to [remintInterval] and the failure backoff.
  /// A failed mint keeps any still-valid credential.
  Future<String?> ensure({
    required String userId,
    required String? accessToken,
    required Uri origin,
    required MobileClientMint mint,
    bool force = false,
    String? rejected,
  }) async {
    final binding = _bindingFor(userId, accessToken);
    if (binding == null) return null;
    final _Credential? existing;
    try {
      if (rejected != null && (await _read())[userId]?.token == rejected) {
        await _settle(_edit((entries) => entries.remove(userId)));
      }
      existing = await _valid(userId, binding);
    } on TimeoutException {
      // Without a storage answer there is nowhere to keep a mint either.
      _logReadTimeout();
      return null;
    }
    final now = _now;
    if (!force &&
        existing != null &&
        existing.expiresAt.difference(now) > refreshWindow) {
      return existing.token;
    }
    final key = '$userId|$binding';
    // A mint already running for this session answers every caller.
    final running = _inFlight[key];
    if (running != null) return await running;
    final blocked = _blockedUntil[userId];
    final last = _lastAttempt[userId];
    if ((blocked != null && now.isBefore(blocked)) ||
        (force && last != null && now.difference(last) < remintInterval)) {
      return existing?.token;
    }
    return await (_inFlight[key] ??=
        _mint(userId, binding, origin, mint, existing).whenComplete(() {
          // A block body: returning the removed future would await itself.
          unawaited(_inFlight.remove(key));
        }));
  }

  Future<String?> _mint(
    String userId,
    String binding,
    Uri origin,
    MobileClientMint mint,
    _Credential? existing,
  ) async {
    _lastAttempt[userId] = _now;
    final generation = _generation[userId] ?? 0;
    final epoch = _epoch;
    try {
      final page = origin.replace(
        path: _turnstilePath,
        queryParameters: {'purpose': mobileClientTurnstilePurpose},
      );
      final captcha = await _turnstile(
        page,
        binding,
      ).timeout(const Duration(seconds: 25));
      final response = await mint(captcha);
      final credential = _Credential.parse(response['mobile_client'], binding);
      if (credential == null || !credential.expiresAt.isAfter(_now)) {
        throw const FormatException('Invalid mobile client credential');
      }
      _failures.remove(userId);
      _blockedUntil.remove(userId);
      // Sign-out or an account switch during the mint discards the result.
      if ((_generation[userId] ?? 0) != generation || _epoch != epoch) {
        return null;
      }
      await _settle(_edit((entries) => entries[userId] = credential));
      return credential.token;
    } on Object catch (error) {
      final failures = (_failures[userId] ?? 0) + 1;
      _failures[userId] = failures;
      final backoff = Duration(
        milliseconds: math.min(
          maxBackoff.inMilliseconds,
          minBackoff.inMilliseconds * math.pow(2, failures - 1).toInt(),
        ),
      );
      _blockedUntil[userId] = _now.add(backoff);
      developer.log(
        'Mobile client credential mint failed: ${error.runtimeType}; '
        'retry after ${backoff.inSeconds}s',
        name: 'MobileClientCredentials',
      );
      return existing?.token;
    }
  }

  /// Stores the credential a mobile sign-in response issued for [accessToken].
  Future<void> storeIssued({
    required String userId,
    required String? accessToken,
    required Object? mobileClient,
  }) async {
    final binding = _bindingFor(userId, accessToken);
    final credential = binding == null
        ? null
        : _Credential.parse(mobileClient, binding);
    if (credential == null || !credential.expiresAt.isAfter(_now)) return;
    _failures.remove(userId);
    _blockedUntil.remove(userId);
    await _edit((entries) => entries[userId] = credential);
  }

  Future<void> clear(String userId) {
    _generation[userId] = (_generation[userId] ?? 0) + 1;
    _failures.remove(userId);
    _blockedUntil.remove(userId);
    _lastAttempt.remove(userId);
    return _edit((entries) => entries.remove(userId));
  }

  Future<void> clearAll() {
    _epoch++;
    _failures.clear();
    _blockedUntil.clear();
    _lastAttempt.clear();
    return _edit((entries) => entries.clear());
  }

  /// Clears an account's credential when it signs out or another account
  /// becomes active.
  void watch(GoTrueClient auth) {
    unawaited(_authChanges?.cancel());
    var active = auth.currentUser?.id;
    _authChanges = auth.onAuthStateChange.listen((state) {
      final next = state.session?.user.id;
      final previous = active;
      active = next;
      if (previous != null &&
          (state.event == AuthChangeEvent.signedOut || next != previous)) {
        unawaited(clear(previous));
      }
    });
  }
}
