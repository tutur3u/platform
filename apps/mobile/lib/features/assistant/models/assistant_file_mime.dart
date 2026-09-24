import 'package:mime/mime.dart';

String assistantMimeTypeFromExtension(String extension) => extension == 'm4a'
    ? 'audio/m4a'
    : lookupMimeType('attachment.$extension') ?? 'application/octet-stream';
