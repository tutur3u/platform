part of 'assistant_model_downloads_test.dart';

class _Transfer implements ModelTransfer {
  final done = Completer<File>();
  @override
  final ValueNotifier<double?> progress = ValueNotifier<double?>(0);
  @override
  final ValueNotifier<ModelTransferStatus> status = ValueNotifier(
    ModelTransferStatus.downloading,
  );
  bool cancelled = false;
  bool controlFails = false;
  @override
  Future<File> get file => done.future;
  @override
  Future<bool> pause() async {
    if (controlFails) throw StateError('Native control unavailable');
    status.value = ModelTransferStatus.paused;
    return true;
  }

  @override
  Future<bool> resume() async {
    if (controlFails) throw StateError('Native control unavailable');
    status.value = ModelTransferStatus.downloading;
    return true;
  }

  @override
  Future<bool> cancel() async {
    cancelled = true;
    if (!done.isCompleted) {
      done.completeError(
        const LocalModelException(LocalModelFailure.cancelled),
      );
    }
    return true;
  }
}

class _Transport implements ModelTransferTransport {
  final transfer = _Transfer();
  ModelTransfer? retained;
  int starts = 0;
  final entered = Completer<void>();
  bool? wifiOnly;
  Completer<void>? initialization;
  @override
  Future<void> initialize() async {
    await initialization?.future;
  }

  @override
  ModelTransfer? restored(AssistantLocalModel model) => retained;
  @override
  Future<ModelTransfer> start(
    AssistantLocalModel model, {
    required bool wifiOnly,
  }) async {
    starts++;
    if (!entered.isCompleted) entered.complete();
    this.wifiOnly = wifiOnly;
    return transfer;
  }
}

class _SettingsStore extends AssistantLocalModelStore {
  _SettingsStore(AssistantModelDownloads downloads)
    : super(background: downloads);
  @override
  Future<File?> verifiedFile(AssistantLocalModel model) async => null;
}
