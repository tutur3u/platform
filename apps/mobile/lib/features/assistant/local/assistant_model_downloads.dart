// Large weight IO is asynchronous to keep the UI isolate responsive.
// ignore_for_file: avoid_slow_async_io
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_model_download_failure.dart';
import 'package:mobile/features/assistant/local/assistant_model_transfer.dart';
import 'package:path_provider/path_provider.dart';

@immutable
class ModelDownloadState {
  const ModelDownloadState(
    this.modelId, {
    this.progress = 0,
    this.paused = false,
    this.complete = false,
    this.failure,
  });
  final String modelId;
  final double progress;
  final bool paused;
  final bool complete;
  final LocalModelFailure? failure;
  bool get active => !complete && failure == null;
}

/// App-lifetime public-weight jobs. Native persistence owns transfer recovery;
/// Only exact bytes/digest enter the model directory; no actor or prompt is stored.
class AssistantModelDownloads {
  AssistantModelDownloads({
    required ModelTransferTransport transport,
    required Future<Directory> Function() directory,
    this.models = assistantLocalModels,
    this.budgetBytes = 1024 * 1024 * 1024,
  }) : _transport = transport,
       _directory = directory;

  static final instance = AssistantModelDownloads(
    transport: NativeModelTransferTransport(),
    directory: () async => Directory(
      '${(await getApplicationSupportDirectory()).path}/mira-local-models',
    ),
  );
  final ModelTransferTransport _transport;
  final Future<Directory> Function() _directory;
  final List<AssistantLocalModel> models;
  final int budgetBytes;
  final state = ValueNotifier<ModelDownloadState?>(null);
  Future<void>? _initialization;
  Future<File>? _job;
  ModelTransfer? _transfer;
  bool _cancelled = false;
  bool get busy => _job != null;

  Future<void> initialize() => _initialization ??= _initialize().catchError((
    Object error,
    StackTrace stack,
  ) {
    _initialization = null;
    Error.throwWithStackTrace(error, stack);
  });

  Future<void> _initialize() async {
    await _transport.initialize();
    for (final model in models) {
      if (model.requiresLicensedImport) continue;
      final transfer = _transport.restored(model);
      if (transfer == null) continue;
      final directory = await _directory();
      if (transfer.status.value == ModelTransferStatus.complete &&
          !await File('${directory.path}/${model.id}.download').exists()) {
        continue;
      }
      if (_job != null) continue;
      _start(model, transfer);
    }
  }

  Future<File> download(
    AssistantLocalModel model, {
    required bool wifiOnly,
  }) async {
    if (!models.contains(model) || model.requiresLicensedImport) {
      throw const LocalModelException(LocalModelFailure.authentication);
    }
    await initialize();
    if (_job != null) {
      if (state.value?.modelId == model.id) return await _job!;
      throw const LocalModelException(LocalModelFailure.busy);
    }
    // Reserve before disk reads, so two rapid taps cannot over-admit.
    final result = Completer<File>();
    _job = result.future;
    unawaited(result.future.then<void>((_) {}, onError: (Object _) {}));
    _cancelled = false;
    state.value = ModelDownloadState(model.id);
    try {
      final directory = await _directory();
      await directory.create(recursive: true);
      await _checkBudget(directory, model);
      if (_cancelled) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
      final transfer = await _transport.start(model, wifiOnly: wifiOnly);
      _transfer = transfer;
      if (_cancelled) await transfer.cancel();
      result.complete(await _verify(model, transfer));
    } on Object catch (error, stack) {
      final failure = _failure(error);
      state.value = ModelDownloadState(model.id, failure: failure);
      result.completeError(LocalModelException(failure), stack);
    } finally {
      _job = null;
      _transfer = null;
    }
    return await result.future;
  }

  void _start(AssistantLocalModel model, ModelTransfer transfer) {
    _cancelled = false;
    _transfer = transfer;
    _job = _verify(model, transfer)
        .catchError((Object error) {
          final failure = _failure(error);
          state.value = ModelDownloadState(model.id, failure: failure);
          throw LocalModelException(failure);
        })
        .whenComplete(() {
          _job = null;
          _transfer = null;
        });
    // Observe failures without logging native paths or response bodies.
    unawaited(_job!.then<void>((_) {}, onError: (Object _) {}));
  }

  Future<File> _verify(
    AssistantLocalModel model,
    ModelTransfer transfer,
  ) async {
    void publish() => state.value = ModelDownloadState(
      model.id,
      progress: transfer.progress.value?.clamp(0, 1) ?? 0,
      paused: transfer.status.value == ModelTransferStatus.paused,
    );
    transfer.progress.addListener(publish);
    transfer.status.addListener(publish);
    publish();
    File? source;
    File? ownedSource;
    Object? primaryFailure;
    try {
      source = await transfer.file;
      if (_cancelled) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
      final directory = await _directory();
      final expected = File('${directory.path}/${model.id}.download');
      if (source.path == expected.path) ownedSource = source;
      if (source.path != expected.path ||
          await source.length() != model.bytes ||
          (await sha256.bind(source.openRead()).first).toString() !=
              model.sha256) {
        throw const LocalModelException(LocalModelFailure.integrity);
      }
      if (_cancelled) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
      await _checkBudget(directory, model);
      if (_cancelled) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
      final installed = await source.rename(
        '${directory.path}/${model.id}.litertlm',
      );
      state.value = ModelDownloadState(model.id, progress: 1, complete: true);
      return installed;
    } on Object catch (error) {
      primaryFailure = error;
      rethrow;
    } finally {
      transfer.progress.removeListener(publish);
      transfer.status.removeListener(publish);
      try {
        if (ownedSource != null && await ownedSource.exists()) {
          await ownedSource.delete();
        }
      } on Object {
        if (primaryFailure == null) rethrow;
      }
    }
  }

  Future<void> _checkBudget(
    Directory directory,
    AssistantLocalModel model,
  ) async {
    var occupied = 0;
    for (final row in models) {
      final file = File('${directory.path}/${row.id}.litertlm');
      if (await file.exists()) occupied += await file.length();
    }
    // Replacement and restored jobs need both installed and incoming bytes.
    if (model.bytes <= 0 || occupied + model.bytes > budgetBytes) {
      throw const LocalModelException(LocalModelFailure.budget);
    }
  }

  LocalModelFailure _failure(Object error) => switch (error) {
    LocalModelException() => error.reason,
    FileSystemException() => LocalModelFailure.storage,
    _ => LocalModelFailure.unavailable,
  };

  Future<void> cancel() async {
    _cancelled = true;
    try {
      await _transfer?.cancel();
    } on Object catch (error) {
      final previous = state.value;
      if (previous != null) {
        state.value = ModelDownloadState(
          previous.modelId,
          failure: _failure(error),
        );
      }
    }
  }

  Future<bool> pause() async => await _transfer?.pause() ?? false;
  Future<bool> resume() async => await _transfer?.resume() ?? false;
}
