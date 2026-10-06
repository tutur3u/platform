// Large model storage stays asynchronous to avoid blocking the UI isolate.
// ignore_for_file: avoid_slow_async_io

import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_model_download_failure.dart';
import 'package:mobile/features/assistant/local/assistant_model_downloads.dart';
import 'package:path_provider/path_provider.dart';

export 'package:mobile/features/assistant/local/assistant_model_download_failure.dart';

/// Public weights are device-owned, not conversation caches. Selection and
/// generation remain actor-scoped. Every publication is fenced to its caller.
class AssistantLocalModelStore {
  AssistantLocalModelStore({
    Future<Directory> Function()? directory,
    http.Client Function()? client,
    Future<void> Function(File)? deletePartial,
    this.budgetBytes = 1024 * 1024 * 1024,
    this.models = assistantLocalModels,
    AssistantModelDownloads? background,
  }) : _directory = directory ?? _defaultDirectory,
       _client = client ?? http.Client.new,
       _deletePartial = deletePartial ?? _defaultDeletePartial,
       background =
           background ??
           (client == null &&
                   directory == null &&
                   (Platform.isAndroid || Platform.isIOS)
               ? AssistantModelDownloads.instance
               : null);

  final AssistantModelDownloads? background;
  final Future<Directory> Function() _directory;
  final http.Client Function() _client;
  final Future<void> Function(File) _deletePartial;
  final int budgetBytes;
  final List<AssistantLocalModel> models;
  http.Client? _activeClient;
  int _generation = 0;
  static Object? _installOwner;

  static Future<Directory> _defaultDirectory() async {
    final support = await getApplicationSupportDirectory();
    return Directory('${support.path}/mira-local-models');
  }

  static Future<void> _defaultDeletePartial(File file) async {
    if (await file.exists()) await file.delete();
  }

  void cancel() {
    cancelForeground();
    final downloads = background;
    if (downloads != null) unawaited(downloads.cancel());
  }

  void cancelForeground() {
    _generation++;
    _activeClient?.close();
  }

  Future<File> _file(AssistantLocalModel model) async {
    if (!models.contains(model) ||
        !RegExp(r'^[a-z0-9-]+$').hasMatch(model.id)) {
      throw const LocalModelException(LocalModelFailure.unavailable);
    }
    final directory = await _directory();
    await directory.create(recursive: true);
    return File('${directory.path}/${model.id}.litertlm');
  }

  Future<File?> verifiedFile(AssistantLocalModel model) async {
    await background?.initialize();
    final file = await _file(model);
    if (!await file.exists()) return null;
    if (await file.length() != model.bytes) return null;
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString() == model.sha256 ? file : null;
  }

  Future<void> remove(AssistantLocalModel model) async {
    await background?.initialize();
    if (_installOwner != null || (background?.busy ?? false)) {
      throw const LocalModelException(LocalModelFailure.busy);
    }
    final owner = _installOwner = Object();
    try {
      final file = await _file(model);
      if (await file.exists()) await file.delete();
    } finally {
      if (identical(_installOwner, owner)) _installOwner = null;
    }
  }

  Future<File> download(
    AssistantLocalModel model, {
    required bool Function() isScopeCurrent,
    required void Function(int received, int total) onProgress,
    bool wifiOnly = true,
  }) async {
    if (!isScopeCurrent()) {
      throw const LocalModelException(LocalModelFailure.cancelled);
    }
    final downloads = background;
    if (downloads != null) {
      await downloads.initialize();
      if (!isScopeCurrent()) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
      if (downloads.busy) {
        return await downloads.download(model, wifiOnly: wifiOnly);
      }
      if (_installOwner != null) {
        throw const LocalModelException(LocalModelFailure.busy);
      }
      // Reserve synchronously before the manager's admission await. Imports and
      // removals share this lease even if a second store joins the public job.
      final owner = _installOwner = Object();
      try {
        return await downloads.download(model, wifiOnly: wifiOnly);
      } finally {
        if (identical(_installOwner, owner)) _installOwner = null;
      }
    }
    if (model.requiresLicensedImport) {
      throw const LocalModelException(LocalModelFailure.unavailable);
    }
    return await _install(
      model,
      isScopeCurrent: isScopeCurrent,
      onProgress: onProgress,
      source: () async {
        final client = _activeClient = _client();
        final response = await client
            .send(http.Request('GET', model.downloadUri))
            .timeout(const Duration(seconds: 30));
        if (response.statusCode != 200 ||
            (response.contentLength != null &&
                response.contentLength != model.bytes)) {
          throw const LocalModelException(LocalModelFailure.unavailable);
        }
        return response.stream.timeout(const Duration(seconds: 30));
      },
    );
  }

  Future<File> importFile(
    AssistantLocalModel model,
    File source, {
    required bool Function() isScopeCurrent,
    required void Function(int received, int total) onProgress,
  }) => _install(
    model,
    isScopeCurrent: isScopeCurrent,
    onProgress: onProgress,
    source: () async => source.openRead(),
  );

  Future<File> _install(
    AssistantLocalModel model, {
    required Future<Stream<List<int>>> Function() source,
    required bool Function() isScopeCurrent,
    required void Function(int received, int total) onProgress,
  }) async {
    await background?.initialize();
    if (_installOwner != null || (background?.busy ?? false)) {
      throw const LocalModelException(LocalModelFailure.busy);
    }
    final owner = _installOwner = Object();
    final generation = ++_generation;
    File? partial;
    IOSink? sink;
    Object? primaryFailure;
    void checkScope() {
      if (generation != _generation || !isScopeCurrent()) {
        throw const LocalModelException(LocalModelFailure.cancelled);
      }
    }

    try {
      checkScope();
      final destination = await _file(model);
      var occupied = 0;
      for (final installed in models) {
        if (installed.id == model.id) continue;
        final file = await _file(installed);
        if (await file.exists()) occupied += await file.length();
      }
      // Replacement temporarily needs both old and new files on disk.
      if (await destination.exists()) occupied += await destination.length();
      if (model.bytes <= 0 || occupied + model.bytes > budgetBytes) {
        throw const LocalModelException(LocalModelFailure.budget);
      }
      checkScope();
      partial = File('${destination.path}.part');
      sink = partial.openWrite();
      var received = 0;
      final stream = await source();
      checkScope();
      await for (final chunk in stream) {
        checkScope();
        received += chunk.length;
        if (received > model.bytes) {
          throw const LocalModelException(LocalModelFailure.integrity);
        }
        sink.add(chunk);
        // Backpressure bounds retained response chunks even for large weights.
        await sink.flush();
        checkScope();
        onProgress(received, model.bytes);
      }
      await sink.close();
      sink = null;
      checkScope();
      if (received != model.bytes ||
          (await sha256.bind(partial.openRead()).first).toString() !=
              model.sha256) {
        throw const LocalModelException(LocalModelFailure.integrity);
      }
      checkScope();
      return await partial.rename(destination.path);
    } catch (error) {
      primaryFailure = error;
      rethrow;
    } finally {
      Object? cleanupFailure;
      StackTrace? cleanupStack;
      Future<void> attempt(Future<void> Function() action) async {
        try {
          await action();
        } on Object catch (error, stack) {
          cleanupFailure ??= error;
          cleanupStack ??= stack;
        }
      }

      try {
        final client = _activeClient;
        _activeClient = null;
        await attempt(() async => client?.close());
        await attempt(() async {
          await sink?.close();
        });
        if (partial != null) await attempt(() => _deletePartial(partial!));
      } finally {
        // Filesystem or client cleanup must never permanently retain the lease.
        if (identical(_installOwner, owner)) _installOwner = null;
      }
      if (primaryFailure == null && cleanupFailure != null) {
        Error.throwWithStackTrace(cleanupFailure!, cleanupStack!);
      }
    }
  }
}
