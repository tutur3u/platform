import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/cache/cache_key.dart';

/// A separate durable revocation fence survives cache initialization/deletion
/// failures. An unchecked or unreadable fence never authorizes a cached read.
class ScopedCacheAccess {
  ScopedCacheAccess(FlutterSecureStorage storage, {required this.markerPrefix})
    : _storage = storage;

  final FlutterSecureStorage _storage;
  final String markerPrefix;
  final _allowed = <String, bool>{};
  final _reads = <String, Future<bool>>{};
  final _revisions = <String, int>{};

  String _marker(CacheKey key) =>
      '$markerPrefix-${sha256.convert(utf8.encode(key.value))}';

  bool canPeek(CacheKey key) => _allowed[key.value] == true;

  Future<bool> canRead(CacheKey key) => _reads[key.value] ??= _read(key);

  Future<bool> _read(CacheKey key) async {
    final revision = _revisions[key.value] ?? 0;
    final allowed = await _storage.read(key: _marker(key)) == null;
    if (revision != (_revisions[key.value] ?? 0)) {
      return _allowed[key.value] == true;
    }
    _allowed[key.value] = allowed;
    return allowed;
  }

  void block(CacheKey key) {
    _revisions[key.value] = (_revisions[key.value] ?? 0) + 1;
    _allowed[key.value] = false;
    _reads[key.value] = Future<bool>.value(false);
  }

  Future<void> persistDenial(CacheKey key) =>
      _storage.write(key: _marker(key), value: 'denied');

  Future<void> allow(CacheKey key, void Function() checkScope) async {
    checkScope();
    final revision = _revisions[key.value] ?? 0;
    await _storage.delete(key: _marker(key));
    checkScope();
    if (revision != (_revisions[key.value] ?? 0)) {
      throw StateError('Cache access changed during refresh.');
    }
    _allowed[key.value] = true;
    _reads[key.value] = Future<bool>.value(true);
  }
}
