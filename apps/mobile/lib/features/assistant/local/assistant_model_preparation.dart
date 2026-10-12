import 'dart:io';
import 'dart:typed_data';

enum ModelPreparationFailure {
  invalidFormat,
  incompatibleVersion,
  runtimeUnavailable,
  nativeLoad,
  storage,
}

/// Sanitized recovery reason. Native messages can contain private file paths.
class ModelPreparationException implements Exception {
  const ModelPreparationException(this.reason);
  final ModelPreparationFailure reason;

  @override
  String toString() => 'ModelPreparationException(${reason.name})';
}

class LiteRtModelHeader {
  const LiteRtModelHeader(this.major, this.minor, this.patch);
  final int major;
  final int minor;
  final int patch;
}

/// Reads only the 32-byte prefix, never the model payload. The store owns full
/// digest verification; the native reader owns FlatBuffer/section validation.
/// Layout and major-version admission match LiteRT-LM 5e58e9a0's
/// schema/core/litertlm_read.cc, bundled by flutter_edge_ai_litertlm 1.8.7.
Future<LiteRtModelHeader> inspectAssistantModelHeader(File file) async {
  try {
    final handle = await file.open();
    try {
      final length = await handle.length();
      final prefix = await handle.read(32);
      if (prefix.length != 32 ||
          String.fromCharCodes(prefix.take(8)) != 'LITERTLM') {
        throw const ModelPreparationException(
          ModelPreparationFailure.invalidFormat,
        );
      }
      final data = ByteData.sublistView(prefix);
      final major = data.getUint32(8, Endian.little);
      final minor = data.getUint32(12, Endian.little);
      final patch = data.getUint32(16, Endian.little);
      if (major != 1) {
        throw const ModelPreparationException(
          ModelPreparationFailure.incompatibleVersion,
        );
      }
      final headerEnd = data.getUint64(24, Endian.little);
      if (headerEnd <= 32 || headerEnd > length) {
        throw const ModelPreparationException(
          ModelPreparationFailure.invalidFormat,
        );
      }
      return LiteRtModelHeader(major, minor, patch);
    } finally {
      await handle.close();
    }
  } on FileSystemException {
    throw const ModelPreparationException(ModelPreparationFailure.storage);
  }
}

ModelPreparationException assistantNativePreparationError(Object error) {
  if (error is ModelPreparationException) return error;
  if (error is FileSystemException) {
    return const ModelPreparationException(ModelPreparationFailure.storage);
  }
  // These are Dart FFI loader failures and the plugin's explicit ABI rejection,
  // not guesses based on an opaque engine-create failure.
  final message = error.toString();
  final androidLibraryFailure =
      (error is StateError &&
          (message.contains('libStreamProxy.so is missing or would not load') ||
              message.contains('libLiteRtLm.so loaded but does not export') ||
              ((message.contains('libLiteRtLm.so') ||
                      message.contains(
                        'A different copy of the LiteRT-LM symbols',
                      )) &&
                  message.contains('stream-callback ABI')))) ||
      (error is Exception &&
          (message.startsWith(
                'Exception: Failed to load libLiteRtLm.so. On Android',
              ) ||
              (message.startsWith(
                    'BackendInitException: all FFI backends failed.',
                  ) &&
                  message.contains(
                    'cpu: Exception: Failed to load libLiteRtLm.so. On Android',
                  ))));
  if (error is UnsupportedError ||
      androidLibraryFailure ||
      (error is ArgumentError &&
          (message.contains('Failed to load dynamic library') ||
              message.contains('Failed to lookup symbol')))) {
    return const ModelPreparationException(
      ModelPreparationFailure.runtimeUnavailable,
    );
  }
  return const ModelPreparationException(ModelPreparationFailure.nativeLoad);
}
