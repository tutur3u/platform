import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_repository.dart';
import 'package:mobile/features/audience_mode/audience_mode_store.dart';

class MemoryAudienceModeStore implements AudienceModeSnapshotStore {
  final Map<String, AudienceModeLayers> values = {};

  @override
  AudienceModeLayers? peek(String userId, String wsId) =>
      values['$userId/$wsId'];

  @override
  Future<AudienceModeLayers?> read(String userId, String wsId) async =>
      values['$userId/$wsId'];

  @override
  Future<void> write(
    String userId,
    String wsId,
    AudienceModeLayers layers,
  ) async => values['$userId/$wsId'] = layers;
}

class FakeAudienceModeRepository implements AudienceModeRepository {
  final Map<String, AudienceMode?> overrides = {};
  final Map<String, AudienceMode?> defaults = {};
  AudienceMode? account;
  bool fail = false;
  Exception? saveError;
  Map<String, AudienceMode?> pending = {};
  Completer<void>? gate;
  final List<String> saves = [];

  Future<T> _read<T>(T Function() value) async {
    await gate?.future;
    if (fail) throw const ApiException.transport(message: 'offline');
    return value();
  }

  @override
  Future<AudienceMode?> loadOverride(String wsId) =>
      _read(() => overrides[wsId]);

  @override
  Future<AudienceMode?> loadWorkspaceDefault(String wsId) =>
      _read(() => defaults[wsId]);

  @override
  Future<AudienceMode?> loadAccount() => _read(() => account);

  @override
  Future<Map<String, AudienceMode?>> pendingWrites(String wsId) async =>
      pending;

  Future<void> _save(String label) async {
    saves.add(label);
    if (saveError case final error?) throw error;
  }

  @override
  Future<void> saveOverride(String wsId, AudienceMode? mode) =>
      _save('override:$wsId:${mode?.wireValue}');

  @override
  Future<void> saveWorkspaceDefault(String wsId, AudienceMode? mode) =>
      _save('default:$wsId:${mode?.wireValue}');

  @override
  Future<void> saveAccount(String? wsId, AudienceMode? mode) =>
      _save('account:${mode?.wireValue}');
}
