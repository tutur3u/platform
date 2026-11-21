import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/device_secure_storage.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:path_provider/path_provider.dart';

/// A thread list as it was last read from the machine, and when.
typedef FleetCachedThreads = ({FleetThreadPage page, DateTime savedAt});

/// Names one cached list: a machine, with at most one project and one state.
/// Searches are not cached.
String fleetThreadListKey({
  required String machineId,
  String? environmentId,
  String? projectId,
  FleetThreadState? state,
}) => [
  machineId,
  environmentId ?? '',
  projectId ?? '',
  state?.name ?? '',
].join('|');

/// The last thread lists the owner saw, kept on this device only, so a list
/// renders at once and still shows, with its age, while the machine is
/// offline. Thread titles never rest in the cloud; here they rest encrypted.
abstract interface class FleetThreadCache {
  Future<FleetCachedThreads?> read(String listKey);

  /// Keeps the first page of a list. Later pages are not cached.
  Future<void> write(String listKey, FleetThreadPage page);

  /// Erases the cached lists of the account [userId], and the key that opens
  /// them. A sign-out passes the account that signed out, whoever is signed
  /// in when it runs.
  Future<void> clear(String userId);
}

/// An account as a file-safe name; null for no account.
String? _account(String? userId) => userId == null || userId.isEmpty
    ? null
    : sha256.convert(utf8.encode(userId)).toString();

/// Lists kept per account: the ones saved last.
const _maxLists = 6;

/// Threads kept per list: the first screenful.
const _maxThreads = 50;

/// [lists] with [page] saved under [listKey], cut to what a cache keeps.
Map<String, FleetCachedThreads> _saved(
  Map<String, FleetCachedThreads> lists,
  String listKey,
  FleetThreadPage page,
  DateTime savedAt,
) {
  final next = {
    ...lists,
    listKey: (
      page: FleetThreadPage(
        machineId: page.machineId,
        environmentId: page.environmentId,
        threads: page.threads.take(_maxThreads).toList(growable: false),
        nextCursor: page.nextCursor,
        total: page.total,
      ),
      savedAt: savedAt,
    ),
  };
  final newest = next.entries.toList()
    ..sort((a, b) => b.value.savedAt.compareTo(a.value.savedAt));
  return Map.fromEntries(newest.take(_maxLists));
}

/// Kept for one run of the app, per account: one account never reads what
/// another saved, and nothing is read or written while signed out.
final class MemoryFleetThreadCache implements FleetThreadCache {
  MemoryFleetThreadCache({
    required String? Function() userId,
    DateTime Function()? now,
  }) : _userId = userId,
       _now = now ?? DateTime.now;

  final String? Function() _userId;
  final DateTime Function() _now;
  final _lists = <String, Map<String, FleetCachedThreads>>{};

  @override
  Future<FleetCachedThreads?> read(String listKey) async =>
      _lists[_account(_userId())]?[listKey];

  @override
  Future<void> write(String listKey, FleetThreadPage page) async {
    final owner = _account(_userId());
    if (owner == null) return;
    _lists[owner] = _saved(
      _lists[owner] ?? const {},
      listKey,
      page,
      _now().toUtc(),
    );
  }

  @override
  Future<void> clear(String userId) async => _lists.remove(_account(userId));
}

/// `<cache>/mastermind/<sha256(userId)>/fleet_threads.enc`, sealed with
/// AES-256-GCM under a key that lives in the device keystore and is bound, as
/// associated data, to the signed-in account. The file alone opens nothing,
/// and a file copied to another account's folder does not open there. The
/// newest [maxLists] lists are kept. No call throws. While the keystore or
/// the cache directory cannot be reached, a read finds nothing cached and a
/// write saves nothing, so what is stored stays as it is. A file that is
/// oversized, damaged or does not open under this account's key is removed.
/// A cached list is returned only to the account that is still signed in
/// when the read finishes. Operations run on one serial queue; writes are a
/// temp file, then a rename.
final class EncryptedFleetThreadCache implements FleetThreadCache {
  EncryptedFleetThreadCache({
    required String? Function() userId,
    Future<Directory> Function()? baseDirectory,
    FlutterSecureStorage? keyStore,
    DateTime Function()? now,
  }) : _userId = userId,
       _baseDirectory = baseDirectory ?? getApplicationCacheDirectory,
       _keyStore = keyStore ?? deviceSecureStorage,
       _now = now ?? DateTime.now;

  static const int maxLists = _maxLists;
  static const int maxThreads = _maxThreads;
  static const int _maxBytes = 1024 * 1024;
  static const _version = 1;
  static const _keyPrefix = 'mastermind-fleet-threads-key-v1.';
  static final AesGcm _cipher = AesGcm.with256bits();

  final String? Function() _userId;
  final Future<Directory> Function() _baseDirectory;
  final FlutterSecureStorage _keyStore;
  final DateTime Function() _now;
  Future<void> _tail = Future<void>.value();

  Future<T> _serial<T>(Future<T> Function() operation) {
    final future = _tail.then((_) => operation());
    _tail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  String? _current() => _account(_userId());

  Future<File> _file(String owner) async {
    final base = await _baseDirectory();
    return File('${base.path}/mastermind/$owner/fleet_threads.enc');
  }

  List<int> _context(String owner) =>
      utf8.encode('mastermind-fleet-threads-v$_version\n$owner');

  Future<SecretKey?> _key(String owner, {required bool create}) async {
    final name = '$_keyPrefix$owner';
    final stored = await _keyStore.read(key: name);
    if (stored != null) {
      try {
        final bytes = base64Decode(stored);
        if (bytes.length == 32) return SecretKey(bytes);
      } on FormatException {
        // Replaced below when a write needs it.
      }
    }
    if (!create) return null;
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    await _keyStore.write(key: name, value: base64Encode(bytes));
    return SecretKey(bytes);
  }

  Future<void> _discard(File file) async {
    try {
      if (file.existsSync()) await file.delete();
    } on FileSystemException {
      // Still there; the next write replaces it.
    }
  }

  /// The lists stored for [owner]: empty when there are none, and null when
  /// the keystore or the cache directory cannot be reached, in which case
  /// nothing is known about what is stored and nothing may replace it.
  Future<Map<String, FleetCachedThreads>?> _load(String owner) async {
    final File file;
    final SecretKey? key;
    final List<int> bytes;
    try {
      file = await _file(owner);
      if (!file.existsSync()) return {};
      if (await file.length() > _maxBytes) {
        await _discard(file);
        return {};
      }
      key = await _key(owner, create: false);
      bytes = await file.readAsBytes();
    } on Object {
      return null;
    }
    final Map<String, dynamic> lists;
    try {
      final envelope = jsonDecode(utf8.decode(bytes));
      if (key == null ||
          envelope is! Map<String, dynamic> ||
          envelope['v'] != _version) {
        throw const FormatException('envelope');
      }
      final nonce = base64Decode(envelope['n'] as String);
      final sealed = base64Decode(envelope['c'] as String);
      if (nonce.length != 12 || sealed.length < 16) {
        throw const FormatException('envelope');
      }
      final plain = await _cipher.decrypt(
        SecretBox(
          sealed.sublist(0, sealed.length - 16),
          nonce: nonce,
          mac: Mac(sealed.sublist(sealed.length - 16)),
        ),
        secretKey: key,
        aad: _context(owner),
      );
      lists = jsonDecode(utf8.decode(plain)) as Map<String, dynamic>;
    } on Object {
      // Not ours, damaged, or sealed under a key that is gone.
      await _discard(file);
      return {};
    }
    final kept = <String, FleetCachedThreads>{};
    for (final MapEntry(key: name, :value) in lists.entries) {
      if (value is! Map<String, dynamic>) continue;
      final savedAt = DateTime.tryParse('${value['savedAt']}');
      if (savedAt == null) continue;
      try {
        kept[name] = (
          page: FleetThreadPage.parse(value['page']),
          savedAt: savedAt.toUtc(),
        );
      } on FormatException {
        // A list saved in a shape this version does not read: only it goes.
      }
    }
    return kept;
  }

  @override
  Future<FleetCachedThreads?> read(String listKey) {
    final owner = _current();
    if (owner == null) return Future.value();
    return _serial(() async {
      final cached = (await _load(owner))?[listKey];
      // Nothing is handed to an account that signed in while this waited.
      return _current() == owner ? cached : null;
    });
  }

  @override
  Future<void> write(String listKey, FleetThreadPage page) {
    final owner = _current();
    if (owner == null) return Future<void>.value();
    return _serial(() async {
      // Nothing is written for an account that signed out meanwhile.
      if (_current() != owner) return;
      try {
        final stored = await _load(owner);
        // What is stored could not be read, so it is not replaced either.
        if (stored == null) return;
        final lists = _saved(stored, listKey, page, _now().toUtc());
        final plain = utf8.encode(
          jsonEncode({
            for (final MapEntry(:key, :value) in lists.entries)
              key: {
                'savedAt': value.savedAt.toIso8601String(),
                'page': value.page.toJson(),
              },
          }),
        );
        final key = await _key(owner, create: true);
        final random = Random.secure();
        final box = await _cipher.encrypt(
          plain,
          secretKey: key!,
          nonce: List<int>.generate(12, (_) => random.nextInt(256)),
          aad: _context(owner),
        );
        final file = await _file(owner);
        await file.parent.create(recursive: true);
        final temp = File('${file.path}.tmp');
        await temp.writeAsString(
          jsonEncode({
            'v': _version,
            'n': base64Encode(box.nonce),
            'c': base64Encode([...box.cipherText, ...box.mac.bytes]),
          }),
          flush: true,
        );
        await temp.rename(file.path);
      } on Object {
        // The cache is a convenience: a list that cannot be saved is fetched
        // again next time.
      }
    });
  }

  @override
  Future<void> clear(String userId) {
    final owner = _account(userId);
    if (owner == null) return Future<void>.value();
    return _serial(() async {
      try {
        await _discard(await _file(owner));
      } on Object {
        // No cache directory, so no file to remove.
      }
      try {
        await _keyStore.delete(key: '$_keyPrefix$owner');
      } on Object {
        // A key that outlives its file opens nothing.
      }
    });
  }
}

/// Persistent on phones; memory elsewhere (tests, desktop debug builds).
FleetThreadCache createFleetThreadCache({required String? Function() userId}) =>
    Platform.isAndroid || Platform.isIOS
    ? EncryptedFleetThreadCache(userId: userId)
    : MemoryFleetThreadCache(userId: userId);
