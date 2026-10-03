import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Storage extends Mock implements FlutterSecureStorage {}

/// Encrypted persistence and authenticated replay with synthetic transport.
class OfflineInventoryHarness {
  OfflineInventoryHarness._(this.directory, this.store);

  final Directory directory;
  final CacheStore store;
  late final OfflineMutationQueue queue;

  static Future<OfflineInventoryHarness> create(
    ApiClient api, {
    bool online = true,
  }) async {
    final directory = await Directory.systemTemp.createTemp(
      'inventory-fixture-',
    );
    final storage = _Storage();
    final secrets = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    final store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    final harness = OfflineInventoryHarness._(directory, store)
      ..queue = OfflineMutationQueue.forTesting(
        store: store,
        userId: () => 'actor',
        checkConnectivity: () async => [
          if (online) ConnectivityResult.wifi else ConnectivityResult.none,
        ],
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        authChanges: const Stream<supa.AuthState>.empty(),
        apiFactory: (_) => api,
      );
    await harness.queue.init();
    await harness.queue.synchronize();
    return harness;
  }

  Future<void> dispose() async {
    try {
      await queue.synchronize();
    } finally {
      try {
        await queue.dispose();
      } finally {
        try {
          await store.closeForTesting();
        } finally {
          try {
            await Hive.close();
          } finally {
            if (directory.existsSync()) await directory.delete(recursive: true);
          }
        }
      }
    }
  }
}
