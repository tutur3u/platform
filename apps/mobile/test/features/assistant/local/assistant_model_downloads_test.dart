// Match the production controller's asynchronous large-file IO boundaries.
// ignore_for_file: avoid_slow_async_io
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_model_downloads.dart';
import 'package:mobile/features/assistant/local/assistant_model_transfer.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'assistant_model_downloads_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const bytes = [1, 2, 3, 4];
  late Directory directory;
  late _Transport transport;
  late AssistantLocalModel model;
  late AssistantModelDownloads downloads;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mira-public-transfer-');
    transport = _Transport();
    model = AssistantLocalModel(
      id: assistantLocalModels[1].id,
      name: 'Fixture',
      repository: 'publisher/model',
      revision: 'pinned-revision',
      filename: 'published.litertlm',
      sha256: sha256.convert(bytes).toString(),
      bytes: bytes.length,
      licenseUrl: 'https://fixture.invalid/license',
    );
    downloads = AssistantModelDownloads(
      transport: transport,
      directory: () async => directory,
      models: [model],
      budgetBytes: 100,
    );
  });
  tearDown(() async {
    if (downloads.busy) {
      await downloads.cancel();
      await Future<void>.delayed(Duration.zero);
    }
    await directory.delete(recursive: true);
  });
  Future<void> entered() async {
    await transport.entered.future;
    // Transport enqueue returns asynchronously; wait for controller attachment.
    await Future<void>.delayed(Duration.zero);
  }

  Future<File> payload(List<int> contents) =>
      File('${directory.path}/${model.id}.download').writeAsBytes(contents);

  test('native transfer exposes pending and verification phases', () async {
    final result = downloads.download(model, wifiOnly: true);
    await entered();
    expect(downloads.state.value!.phase.name, 'transferring');
    final observed = <String>[];
    downloads.state.addListener(() {
      observed.add(downloads.state.value!.phase.name);
    });
    transport.transfer.done.complete(await payload(bytes));
    await result;
    expect(observed, contains('verifying'));
    expect(downloads.state.value!.complete, isTrue);
  });

  test('same job retains actual phases when settings reattach', () async {
    SharedPreferences.setMockInitialValues({});
    final result = downloads.download(model, wifiOnly: true);
    await entered();
    transport.transfer.status.value = ModelTransferStatus.queued;
    final settings = AssistantLocalModelsCubit(
      workspaceId: 'team',
      isScopeCurrent: () => true,
      store: _SettingsStore(downloads),
      supported: () async => true,
      preferences: AssistantLocalPreferences(currentUserId: () => 'owner'),
    );
    await settings.load();
    expect(settings.state.downloadPhase, ModelDownloadPhase.queued);
    transport.transfer.status.value = ModelTransferStatus.retryWait;
    expect(settings.state.downloadPhase, ModelDownloadPhase.retryWait);
    await settings.close();
    expect(downloads.busy, isTrue);
    transport.transfer.status.value = ModelTransferStatus.pending;
    expect(downloads.state.value!.phase, ModelDownloadPhase.pending);
    transport.transfer.done.complete(await payload(bytes));
    await result;
    expect(transport.starts, 1);
  });

  test(
    'coalesces taps, retains network consent and verifies before publication',
    () async {
      final first = downloads.download(model, wifiOnly: true);
      final second = downloads.download(model, wifiOnly: false);
      await entered();
      expect(transport.starts, 1);
      expect(transport.wifiOnly, isTrue);
      expect(
        await File('${directory.path}/${model.id}.litertlm').exists(),
        isFalse,
      );
      transport.transfer.progress.value = 0.5;
      expect(downloads.state.value?.progress, 0.5);
      transport.transfer.done.complete(await payload(bytes));
      final result = await first;
      expect((await second).path, result.path);
      expect(await result.readAsBytes(), bytes);
      expect(downloads.state.value?.complete, isTrue);
    },
  );

  test(
    'restores a completed native job without enqueuing or selecting a model',
    () async {
      transport.retained = transport.transfer;
      transport.transfer.status.value = ModelTransferStatus.complete;
      transport.transfer.done.complete(await payload(bytes));
      final published = Completer<void>();
      downloads.state.addListener(() {
        if (downloads.state.value?.complete == true && !published.isCompleted) {
          published.complete();
        }
      });
      await downloads.initialize();
      await published.future;
      expect(transport.starts, 0);
      expect(
        await File('${directory.path}/${model.id}.litertlm').readAsBytes(),
        bytes,
      );
      expect(downloads.state.value?.complete, isTrue);
    },
  );

  test(
    'pause/resume retain the same native task and explicit cancellation fences completion',
    () async {
      final result = downloads.download(model, wifiOnly: false);
      final rejected = expectLater(result, throwsA(isA<LocalModelException>()));
      await entered();
      expect(transport.wifiOnly, isFalse);
      expect(await downloads.pause(), isTrue);
      expect(downloads.state.value?.paused, isTrue);
      expect(await downloads.resume(), isTrue);
      expect(downloads.state.value?.paused, isFalse);
      await downloads.cancel();
      await rejected;
      expect(transport.starts, 1);
      expect(transport.transfer.cancelled, isTrue);
      expect(
        await File('${directory.path}/${model.id}.litertlm').exists(),
        isFalse,
      );
      expect(downloads.state.value?.failure, LocalModelFailure.cancelled);
    },
  );

  test(
    'digest mismatch deletes only staging and preserves installed weights',
    () async {
      final installed = await File(
        '${directory.path}/${model.id}.litertlm',
      ).writeAsBytes(bytes);
      final result = downloads.download(model, wifiOnly: true);
      final rejected = expectLater(
        result,
        throwsA(
          isA<LocalModelException>().having(
            (e) => e.reason,
            'reason',
            LocalModelFailure.integrity,
          ),
        ),
      );
      await entered();
      transport.transfer.done.complete(await payload([4, 3, 2, 1]));
      await rejected;
      expect(await installed.readAsBytes(), bytes);
      expect(
        await File('${directory.path}/${model.id}.download').exists(),
        isFalse,
      );
      expect(downloads.busy, isFalse);
    },
  );

  test('budget and licensed admission reject before native enqueue', () async {
    downloads = AssistantModelDownloads(
      transport: transport,
      directory: () async => directory,
      models: [model],
      budgetBytes: 3,
    );
    await expectLater(
      downloads.download(model, wifiOnly: true),
      throwsA(
        isA<LocalModelException>().having(
          (e) => e.reason,
          'reason',
          LocalModelFailure.budget,
        ),
      ),
    );
    expect(transport.starts, 0);
    await expectLater(
      downloads.download(assistantLocalModels.first, wifiOnly: true),
      throwsA(
        isA<LocalModelException>().having(
          (e) => e.reason,
          'reason',
          LocalModelFailure.authentication,
        ),
      ),
    );
    expect(transport.starts, 0);
  });

  test(
    'closing settings preserves transfer without selecting a model',
    () async {
      SharedPreferences.setMockInitialValues({});
      final preferences = AssistantLocalPreferences(
        currentUserId: () => 'actor',
      );
      final settings = AssistantLocalModelsCubit(
        workspaceId: 'workspace',
        isScopeCurrent: () => true,
        store: _SettingsStore(downloads),
        preferences: preferences,
        supported: () async => true,
      );
      await settings.load();
      final job = settings.download(model);
      await entered();
      await settings.close();
      expect(transport.transfer.cancelled, isFalse);
      transport.transfer.done.complete(await payload(bytes));
      await job;
      expect(downloads.state.value?.complete, isTrue);
      expect(
        await preferences.load('workspace', isScopeCurrent: () => true),
        isNull,
      );
    },
  );

  test(
    'restored publication rechecks occupied and replacement bytes',
    () async {
      final installed = await File(
        '${directory.path}/${model.id}.litertlm',
      ).writeAsBytes(bytes);
      downloads = AssistantModelDownloads(
        transport: transport,
        directory: () async => directory,
        models: [model],
        budgetBytes: bytes.length,
      );
      transport.retained = transport.transfer;
      transport.transfer.status.value = ModelTransferStatus.complete;
      transport.transfer.done.complete(await payload(bytes));
      final rejected = Completer<void>();
      downloads.state.addListener(() {
        if (downloads.state.value?.failure == LocalModelFailure.budget &&
            !rejected.isCompleted) {
          rejected.complete();
        }
      });
      await downloads.initialize();
      await rejected.future;
      expect(await installed.readAsBytes(), bytes);
      expect(
        await File('${directory.path}/${model.id}.download').exists(),
        isFalse,
      );
      expect(transport.starts, 0);
    },
  );

  test(
    'deferred initialization serializes real import before native admission',
    () async {
      transport.initialization = Completer<void>();
      final store = AssistantLocalModelStore(
        background: downloads,
        directory: () async => directory,
        models: [model],
      );
      final source = await File(
        '${directory.path}/import-source',
      ).writeAsBytes(bytes);
      final imported = store.importFile(
        model,
        source,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      final download = store.download(
        model,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      final rejected = expectLater(
        download,
        throwsA(
          isA<LocalModelException>().having(
            (e) => e.reason,
            'reason',
            LocalModelFailure.busy,
          ),
        ),
      );
      transport.initialization!.complete();
      expect(await (await imported).readAsBytes(), bytes);
      await rejected;
      expect(transport.starts, 0);
      expect(await source.readAsBytes(), bytes);
    },
  );

  test(
    'scope changes during native initialization never admit a new job',
    () async {
      transport.initialization = Completer<void>();
      var current = true;
      final store = AssistantLocalModelStore(
        background: downloads,
        directory: () async => directory,
        models: [model],
      );
      final job = store.download(
        model,
        isScopeCurrent: () => current,
        onProgress: (_, _) {},
      );
      final rejected = expectLater(
        job,
        throwsA(
          isA<LocalModelException>().having(
            (e) => e.reason,
            'reason',
            LocalModelFailure.cancelled,
          ),
        ),
      );
      current = false;
      transport.initialization!.complete();
      await rejected;
      expect(transport.starts, 0);
    },
  );

  test(
    'native control errors remain recoverable without losing job progress',
    () async {
      SharedPreferences.setMockInitialValues({});
      final settings = AssistantLocalModelsCubit(
        workspaceId: 'workspace',
        isScopeCurrent: () => true,
        store: _SettingsStore(downloads),
        supported: () async => true,
      );
      await settings.load();
      final work = settings.download(model);
      await entered();
      transport.transfer.progress.value = 0.5;
      final received = settings.state.received;
      transport.transfer.controlFails = true;
      await settings.pause();
      expect(settings.state.busy, isTrue);
      expect(settings.state.error, LocalModelFailure.unavailable);
      expect(settings.state.received, received);
      transport.transfer.controlFails = false;
      await settings.pause();
      expect(settings.state.paused, isTrue);
      transport.transfer.controlFails = true;
      await settings.resume();
      expect(settings.state.paused, isTrue);
      expect(settings.state.received, received);
      transport.transfer.controlFails = false;
      await settings.resume();
      transport.transfer.done.complete(await payload(bytes));
      await work;
      await settings.close();
      expect(downloads.state.value?.complete, isTrue);
    },
  );

  test('an unexpected file path is never deleted or installed', () async {
    final outside = await File('${directory.path}/unowned').writeAsBytes(bytes);
    final result = downloads.download(model, wifiOnly: true);
    final rejected = expectLater(result, throwsA(isA<LocalModelException>()));
    await entered();
    transport.transfer.done.complete(outside);
    await rejected;
    expect(await outside.readAsBytes(), bytes);
    expect(
      await File('${directory.path}/${model.id}.litertlm').exists(),
      isFalse,
    );
  });
}
