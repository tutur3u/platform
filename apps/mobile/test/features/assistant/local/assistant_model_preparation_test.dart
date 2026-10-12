import 'dart:ffi';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_capability.dart';
import 'package:mobile/features/assistant/local/assistant_model_preparation.dart';

void main() {
  late Directory directory;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mira-preparation-');
  });
  tearDown(() => directory.delete(recursive: true));

  Future<File> fixture({
    String magic = 'LITERTLM',
    int major = 1,
    int minor = 6,
    int patch = 0,
    int end = 40,
    int length = 40,
  }) async {
    final bytes = ByteData(40);
    bytes.buffer.asUint8List().setRange(0, 8, magic.codeUnits);
    bytes
      ..setUint32(8, major, Endian.little)
      ..setUint32(12, minor, Endian.little)
      ..setUint32(16, patch, Endian.little)
      ..setUint64(24, end, Endian.little);
    return await File(
      '${directory.path}/model.litertlm',
    ).writeAsBytes(bytes.buffer.asUint8List().take(length).toList());
  }

  Matcher reason(ModelPreparationFailure failure) =>
      isA<ModelPreparationException>().having(
        (error) => error.reason,
        'reason',
        failure,
      );

  for (final sdk in [28, 29, 30]) {
    test('Android API $sdk admission matches the bundled runtime minimum', () {
      expect(
        permitsAssistantLocalInference(
          abi: Abi.androidArm64,
          memoryMiB: 4096,
          androidSdk: sdk,
        ),
        sdk >= 30,
      );
    });
  }
  test('reads version without claiming complete model compatibility', () async {
    final header = await inspectAssistantModelHeader(
      await fixture(minor: 5, patch: 2),
    );
    expect([header.major, header.minor, header.patch], [1, 5, 2]);
  });
  test('same major admits newer minor to the native reader', () async {
    final header = await inspectAssistantModelHeader(await fixture(minor: 7));
    expect(header.minor, 7);
  });
  for (final length in [0, 8, 20, 31]) {
    test('rejects truncated prefix of $length bytes', () async {
      await expectLater(
        inspectAssistantModelHeader(await fixture(length: length)),
        throwsA(reason(ModelPreparationFailure.invalidFormat)),
      );
    });
  }
  for (final magic in ['GGUF0000', '<html>00', 'TFL30000']) {
    test('rejects $magic rather than trusting the extension', () async {
      await expectLater(
        inspectAssistantModelHeader(await fixture(magic: magic)),
        throwsA(reason(ModelPreparationFailure.invalidFormat)),
      );
    });
  }
  for (final major in [0, 2, 0xffffffff]) {
    test('rejects incompatible major $major', () async {
      await expectLater(
        inspectAssistantModelHeader(await fixture(major: major)),
        throwsA(reason(ModelPreparationFailure.incompatibleVersion)),
      );
    });
  }
  for (final end in [0, 31, 32, 41, 0x7fffffffffffffff]) {
    test('rejects out-of-file or empty metadata end $end', () async {
      await expectLater(
        inspectAssistantModelHeader(await fixture(end: end)),
        throwsA(reason(ModelPreparationFailure.invalidFormat)),
      );
    });
  }
  test('missing file has storage recovery', () async {
    await expectLater(
      inspectAssistantModelHeader(File('${directory.path}/missing')),
      throwsA(reason(ModelPreparationFailure.storage)),
    );
  });
  test('native ABI and dynamic library failures have runtime recovery', () {
    for (final error in [
      UnsupportedError('requires arm64'),
      ArgumentError('Failed to load dynamic library /private/device/model'),
      ArgumentError('Failed to lookup symbol litert_lm_engine_create'),
    ]) {
      expect(
        assistantNativePreparationError(error).reason,
        ModelPreparationFailure.runtimeUnavailable,
      );
      expect(
        assistantNativePreparationError(error).toString(),
        isNot(contains('/private')),
      );
    }
  });
  test('pinned Android library and stream ABI failures get '
      'runtime recovery', () {
    for (final error in [
      StateError(
        'libStreamProxy.so is missing or would not load, so '
        'libLiteRtLm.so could not be put into the default search'
        ' scope and the stream-callback ABI cannot be probed.',
      ),
      StateError(
        'libLiteRtLm.so is loaded but its symbols are not in the'
        ' default search scope. Continuing would register the '
        'wrong stream-callback ABI and corrupt generated text.',
      ),
      StateError(
        'A different copy of the LiteRT-LM symbols is in the '
        'default search scope, so the stream-callback ABI would '
        'be decided from that copy.',
      ),
      StateError(
        'libLiteRtLm.so loaded but does not export litert_lm_engine_create.',
      ),
      Exception(
        'Failed to load libLiteRtLm.so. On Android the usual '
        'causes are: API < 30',
      ),
    ]) {
      expect(
        assistantNativePreparationError(error).reason,
        ModelPreparationFailure.runtimeUnavailable,
      );
    }
    expect(
      assistantNativePreparationError(
        StateError('Client is shutting down'),
      ).reason,
      ModelPreparationFailure.nativeLoad,
    );
  });
  test(
    'opaque native engine failure does not diagnose corruption or memory',
    () {
      expect(
        assistantNativePreparationError(
          Exception('Failed to create engine'),
        ).reason,
        ModelPreparationFailure.nativeLoad,
      );
      expect(
        assistantNativePreparationError(ArgumentError('bad setting')).reason,
        ModelPreparationFailure.nativeLoad,
      );
    },
  );
}
