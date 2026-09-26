import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart' show XFile;

/// A gallery selection backed by the picker's temporary file, avoiding a
/// copy while the user is choosing attachments.
final class GalleryPlatformFile extends PlatformFile {
  GalleryPlatformFile(this.xFile);

  @override
  final XFile xFile;

  @override
  String get name => xFile.name;

  @override
  Uri get uri => Uri.file(xFile.path);

  @override
  int? lengthSync() => null;

  @override
  Future<int> length() => xFile.length();

  @override
  Future<Uint8List> readAsBytes() => xFile.readAsBytes();

  @override
  Stream<Uint8List> readAsByteStream() =>
      xFile.openRead().map(Uint8List.fromList);
}
