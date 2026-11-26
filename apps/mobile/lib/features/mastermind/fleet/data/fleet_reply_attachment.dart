import 'dart:typed_data';

const int fleetReplyMaxFileBytes = 10 * 1024 * 1024;
const int fleetReplyMaxAttachmentBytes = 25 * 1024 * 1024;
const fleetReplyMaxAttachments = 6;

enum FleetReplyAttachmentKind { image, text }

/// In-memory only. The picker supplies the bytes, never a delivery path.
class FleetReplyAttachment {
  FleetReplyAttachment({
    required this.name,
    required this.kind,
    required Uint8List bytes,
  }) : bytes = Uint8List.fromList(bytes).asUnmodifiableView();

  final String name;
  final FleetReplyAttachmentKind kind;
  final Uint8List bytes;
}

/// The uploads for one immutable reply, kept across attempts.
class FleetReplyAttachmentBatch {
  FleetReplyAttachmentBatch(List<FleetReplyAttachment> files)
    : files = List.unmodifiable(files);

  final List<FleetReplyAttachment> files;
  final reservations = <int, String>{};
  final ready = <int>{};
}
