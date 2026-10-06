// Public model bytes only. Never pass app/provider credentials into native tasks.
import 'dart:io';

import 'package:background_downloader/background_downloader.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_model_download_failure.dart';

enum ModelTransferStatus { downloading, paused, complete, failed, cancelled }

abstract interface class ModelTransfer {
  ValueListenable<double?> get progress;
  ValueListenable<ModelTransferStatus> get status;
  Future<File> get file;
  Future<bool> pause();
  Future<bool> resume();
  Future<bool> cancel();
}

abstract interface class ModelTransferTransport {
  Future<void> initialize();
  ModelTransfer? restored(AssistantLocalModel model);
  Future<ModelTransfer> start(
    AssistantLocalModel model, {
    required bool wifiOnly,
  });
}

class NativeModelTransferTransport implements ModelTransferTransport {
  final _downloader = FileDownloader.scoped('mira-public-models');
  static String taskId(AssistantLocalModel model) =>
      'mira-${model.id}-${model.sha256}';

  @override
  Future<void> initialize() => _downloader.start(autoCleanDatabase: true);

  @override
  ModelTransfer? restored(AssistantLocalModel model) {
    final transfer = _downloader.transfers.forId(taskId(model));
    if (transfer == null ||
        transfer.task.url != model.downloadUri.toString() ||
        transfer.task.filename != '${model.id}.download' ||
        transfer.task.directory != 'mira-local-models' ||
        transfer.task.baseDirectory != BaseDirectory.applicationSupport ||
        transfer.task.headers.isNotEmpty ||
        transfer.status.isFinalState &&
            transfer.status != TaskStatus.complete) {
      return null;
    }
    return _NativeModelTransfer(transfer);
  }

  @override
  Future<ModelTransfer> start(
    AssistantLocalModel model, {
    required bool wifiOnly,
  }) async {
    // Explicit retries replace failed/completed handles; resume uses its original
    // native task. No floating source URL or provider auth header is accepted.
    _downloader.transfers.remove(taskId(model));
    final transfer = await _downloader.transfers.start(
      DownloadTask(
        taskId: taskId(model),
        url: model.downloadUri.toString(),
        filename: '${model.id}.download',
        directory: 'mira-local-models',
        baseDirectory: BaseDirectory.applicationSupport,
        requiresWiFi: wifiOnly,
        allowPause: true,
        retries: 3,
        updates: Updates.statusAndProgress,
      ),
    );
    return _NativeModelTransfer(transfer);
  }
}

class _NativeModelTransfer implements ModelTransfer {
  _NativeModelTransfer(this.transfer) {
    transfer.statusNotifier.addListener(_update);
    _update();
  }
  final Transfer transfer;
  final ValueNotifier<ModelTransferStatus> _status = ValueNotifier(
    ModelTransferStatus.downloading,
  );
  void _update() {
    _status.value = switch (transfer.status) {
      TaskStatus.paused => ModelTransferStatus.paused,
      TaskStatus.complete => ModelTransferStatus.complete,
      TaskStatus.failed || TaskStatus.notFound => ModelTransferStatus.failed,
      TaskStatus.canceled => ModelTransferStatus.cancelled,
      _ => ModelTransferStatus.downloading,
    };
    if (transfer.status.isFinalState) {
      transfer.statusNotifier.removeListener(_update);
    }
  }

  @override
  ValueListenable<double?> get progress => transfer.progressNotifier;
  @override
  ValueListenable<ModelTransferStatus> get status => _status;
  @override
  Future<File> get file async {
    final result = await transfer.result;
    if (result.responseStatusCode == 401 || result.responseStatusCode == 403) {
      throw const LocalModelException(LocalModelFailure.authentication);
    }
    if (result.exception is TaskFileSystemException) {
      throw const LocalModelException(LocalModelFailure.storage);
    }
    if (result.status == TaskStatus.canceled) {
      throw const LocalModelException(LocalModelFailure.cancelled);
    }
    if (result.status != TaskStatus.complete) {
      throw const LocalModelException(LocalModelFailure.network);
    }
    return File(await result.task.filePath());
  }

  @override
  Future<bool> pause() => transfer.pause();
  @override
  Future<bool> resume() => transfer.resume();
  @override
  Future<bool> cancel() => transfer.cancel();
}
