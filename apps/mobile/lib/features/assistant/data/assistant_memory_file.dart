import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart' show XFile;

/// A user-confirmed recording or clipboard file, retained only for upload.
final class AssistantMemoryFile extends PlatformFile {
  AssistantMemoryFile({required this.name, required Uint8List bytes})
    : _bytes = bytes;

  @override
  final String name;
  final Uint8List _bytes;

  @override
  Uri get uri => Uri(scheme: 'memory', path: name);
  @override
  XFile get xFile => XFile.fromData(_bytes, name: name);
  @override
  int lengthSync() => _bytes.length;
  @override
  Future<int> length() async => _bytes.length;
  @override
  Future<Uint8List> readAsBytes() async => _bytes;
  @override
  Stream<Uint8List> readAsByteStream() => Stream.value(_bytes);
}
