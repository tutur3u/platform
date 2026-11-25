import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

/// The kinds of media the documents insert group uploads.
enum DocumentMediaKind { image, camera, video, file }

/// The largest upload the web documents editor accepts for each kind:
/// 5 MB images and 50 MB videos (its media limits), and the 100 MB
/// workspace storage limit for other files.
int documentUploadLimit(DocumentMediaKind kind) => switch (kind) {
  DocumentMediaKind.image || DocumentMediaKind.camera => 5 * 1024 * 1024,
  DocumentMediaKind.video => 50 * 1024 * 1024,
  DocumentMediaKind.file => 100 * 1024 * 1024,
};

/// The largest side and JPEG quality a picked photo is scaled to, so a
/// camera photo fits the image limit without visible loss.
const double documentPhotoMaxSide = 2560;
const int documentPhotoQuality = 85;

/// A file chosen to upload. Its bytes are read only after its size passes
/// the limit, so an oversized file is never loaded into memory.
class DocumentPickedFile {
  const DocumentPickedFile({
    required this.name,
    required this.length,
    required this.readAsBytes,
    this.contentType,
  });

  factory DocumentPickedFile.fromXFile(XFile file, {String? name}) =>
      DocumentPickedFile(
        name: name ?? file.name,
        length: file.length,
        readAsBytes: file.readAsBytes,
        contentType: file.mimeType,
      );

  final String name;
  final Future<int> Function() length;
  final Future<Uint8List> Function() readAsBytes;
  final String? contentType;
}

/// Asks the user for media of [kind]; null when they cancel.
typedef DocumentMediaPicker =
    Future<DocumentPickedFile?> Function(DocumentMediaKind kind);

/// Picks with the platform pickers: photos scaled to
/// [documentPhotoMaxSide], videos from the library, any file otherwise.
Future<DocumentPickedFile?> pickDocumentMedia(DocumentMediaKind kind) async {
  if (kind == DocumentMediaKind.file) {
    final file = await FilePicker.pickFile();
    if (file == null) return null;
    return DocumentPickedFile.fromXFile(file.xFile, name: file.name);
  }
  final picker = ImagePicker();
  final picked = switch (kind) {
    DocumentMediaKind.video => await picker.pickVideo(
      source: ImageSource.gallery,
    ),
    _ => await picker.pickImage(
      source: kind == DocumentMediaKind.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: documentPhotoMaxSide,
      maxHeight: documentPhotoMaxSide,
      imageQuality: documentPhotoQuality,
    ),
  };
  return picked == null ? null : DocumentPickedFile.fromXFile(picked);
}
