import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_attachment.dart';
import 'package:mobile/features/mastermind/projects/view/thread_attachment_picker.dart';

void main() {
  GalleryPlatformFile file(String name, List<int> bytes) => GalleryPlatformFile(
    XFile.fromData(Uint8List.fromList(bytes), name: name),
  );

  test(
    'keeps bytes for supported images and arbitrary UTF-8 filenames',
    () async {
      final png = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9kAAAAASUVORK5CYII=',
      );
      final raster = await prepareThreadAttachment(file('image', png), 1024);
      expect(raster.kind, FleetReplyAttachmentKind.image);
      expect(raster.bytes, png);

      final text = utf8.encode('Synthetic file\n');
      final document = await prepareThreadAttachment(
        file('manifest.custom', text),
        1024,
      );
      expect(document.kind, FleetReplyAttachmentKind.text);
      expect(document.bytes, text);
    },
  );

  test('rejects unsupported bytes and the remaining reply limit', () async {
    final binary = file('archive.bin', [0, 255, 0]);
    await expectLater(
      prepareThreadAttachment(binary, 1024),
      throwsA(
        isA<ThreadAttachmentException>().having(
          (error) => error.problem,
          'problem',
          ThreadAttachmentProblem.unsupported,
        ),
      ),
    );
    await expectLater(
      prepareThreadAttachment(binary, 2),
      throwsA(
        isA<ThreadAttachmentException>().having(
          (error) => error.problem,
          'problem',
          ThreadAttachmentProblem.tooLarge,
        ),
      ),
    );
  });
}
