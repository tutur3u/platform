import 'dart:typed_data';

import 'package:http_parser/http_parser.dart';

class ApiMultipartFile {
  const ApiMultipartFile({
    required this.field,
    required this.filePath,
    this.filename,
    this.contentType,
  }) : bytes = null;

  const ApiMultipartFile.bytes({
    required this.field,
    required this.bytes,
    this.filename,
    this.contentType,
  }) : filePath = null;

  final String field;
  final String? filePath;
  final Uint8List? bytes;
  final String? filename;
  final MediaType? contentType;
}
