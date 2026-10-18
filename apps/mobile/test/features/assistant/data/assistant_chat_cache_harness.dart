import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

/// Real disposable encrypted Hive store. No app singleton/customer data.
class ChatCacheDisk {
  late Directory directory;
  late CacheStore store;
  final _storage = _Storage();
  String? _key;
  FutureOr<void> Function(String)? checkpoint;
  Future<void>? openingGate;
  Completer<void>? openingEntered;

  Future<void> setup() async {
    directory = await Directory.systemTemp.createTemp(
      'assistant-cache-control-',
    );
    when(
      () => _storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => _key);
    when(
      () => _storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      _key = call.namedArguments[#value] as String?;
    });
    store = createStore();
    await store.init();
  }

  CacheStore createStore() => CacheStore.forTesting(
    secureStorage: _storage,
    directoryResolver: () async {
      if (!(openingEntered?.isCompleted ?? true)) openingEntered!.complete();
      await openingGate;
      return directory;
    },
    persistenceCheckpoint: (stage) => checkpoint?.call(stage),
  );

  Future<void> reopen() async {
    await store.closeForTesting();
    store = createStore();
    await store.init();
  }

  Future<void> close() async {
    await store.closeForTesting();
    await directory.delete(recursive: true);
  }
}
