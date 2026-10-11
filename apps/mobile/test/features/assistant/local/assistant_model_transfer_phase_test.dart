import 'package:background_downloader/background_downloader.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_model_transfer.dart';

void main() {
  test(
    'native status distinguishes scheduling, transfer and retry waiting',
    () {
      expect(
        modelTransferStatus(TaskStatus.enqueued),
        ModelTransferStatus.queued,
      );
      expect(
        modelTransferStatus(TaskStatus.running),
        ModelTransferStatus.downloading,
      );
      expect(
        modelTransferStatus(TaskStatus.waitingToRetry),
        ModelTransferStatus.retryWait,
      );
      expect(
        modelTransferStatus(TaskStatus.paused),
        ModelTransferStatus.paused,
      );
      expect(
        modelTransferStatus(TaskStatus.complete),
        ModelTransferStatus.complete,
      );
      expect(
        modelTransferStatus(TaskStatus.failed),
        ModelTransferStatus.failed,
      );
      expect(
        modelTransferStatus(TaskStatus.notFound),
        ModelTransferStatus.failed,
      );
      expect(
        modelTransferStatus(TaskStatus.canceled),
        ModelTransferStatus.cancelled,
      );
    },
  );
}
