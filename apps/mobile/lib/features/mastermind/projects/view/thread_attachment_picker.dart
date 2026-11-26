import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_attachment.dart';

enum ThreadAttachmentProblem { unsupported, tooLarge }

class ThreadAttachmentException implements Exception {
  const ThreadAttachmentException(this.problem);

  final ThreadAttachmentProblem problem;
}

Future<FleetReplyAttachment?> pickThreadAttachment(int remainingBytes) async {
  final file = await FilePicker.pickFile();
  if (file == null) return null;
  return await prepareThreadAttachment(file, remainingBytes);
}

Future<FleetReplyAttachment> prepareThreadAttachment(
  PlatformFile file,
  int remainingBytes,
) async {
  final limit = remainingBytes < fleetReplyMaxFileBytes
      ? remainingBytes
      : fleetReplyMaxFileBytes;
  if (await file.length() > limit) {
    throw const ThreadAttachmentException(ThreadAttachmentProblem.tooLarge);
  }
  final buffer = BytesBuilder(copy: false);
  await for (final chunk in file.readAsByteStream()) {
    if (buffer.length + chunk.length > limit) {
      throw const ThreadAttachmentException(ThreadAttachmentProblem.tooLarge);
    }
    buffer.add(chunk);
  }
  final bytes = buffer.takeBytes();
  final kind = _kind(bytes);
  final cleanName = file.name
      .replaceAll(
        RegExp(r'[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f/\\]'),
        '',
      )
      .trim();
  final safeName = String.fromCharCodes(cleanName.runes.take(120));
  return FleetReplyAttachment(
    name: safeName.isEmpty ? 'attachment' : safeName,
    kind: kind,
    bytes: bytes,
  );
}

FleetReplyAttachmentKind _kind(Uint8List bytes) {
  bool startsWith(List<int> signature, [int offset = 0]) =>
      bytes.length >= offset + signature.length &&
      signature.indexed.every((entry) => bytes[offset + entry.$1] == entry.$2);
  if (startsWith(const [0xff, 0xd8, 0xff]) ||
      startsWith(const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
      startsWith('GIF87a'.codeUnits) ||
      startsWith('GIF89a'.codeUnits) ||
      (startsWith('RIFF'.codeUnits) && startsWith('WEBP'.codeUnits, 8))) {
    return FleetReplyAttachmentKind.image;
  }

  try {
    if (bytes.isNotEmpty &&
        !RegExp(r'[\x00-\x08\x0b\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]')
            .hasMatch(utf8.decode(bytes))) {
      return FleetReplyAttachmentKind.text;
    }
  } on FormatException {
    // Binary formats are unsupported by the scoped attachment bridge.
  }
  throw const ThreadAttachmentException(ThreadAttachmentProblem.unsupported);
}
