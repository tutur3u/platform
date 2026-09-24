import 'package:mime/mime.dart';

String assistantMimeTypeFromExtension(String extension) => extension == 'm4a'
    ? 'audio/mp4'
    : lookupMimeType('attachment.$extension') ?? 'application/octet-stream';
