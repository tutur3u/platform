import 'dart:typed_data';

const _app1 = 0xE1; // EXIF and XMP: location, camera serials, timestamps.
const _app13 = 0xED; // IPTC / Photoshop metadata.
const _comment = 0xFE;
const _startOfScan = 0xDA;

/// Losslessly removes EXIF/XMP/IPTC and comments from a JPEG.
///
/// Returns null when the bytes are not a well-formed JPEG or when the EXIF
/// orientation is not upright: dropping that tag would display the photo
/// rotated, so such images must be re-encoded instead.
Uint8List? stripJpegMetadataIfUpright(Uint8List bytes) {
  if (bytes.length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) return null;
  final out = BytesBuilder(copy: false)..add(const [0xFF, 0xD8]);
  var offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] != 0xFF) return null;
    final marker = bytes[offset + 1];
    if (marker == _startOfScan) {
      out.add(Uint8List.sublistView(bytes, offset));
      return out.takeBytes();
    }
    final length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    final end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    final segment = Uint8List.sublistView(bytes, offset, end);
    if (marker == _app1) {
      final orientation = _exifOrientation(Uint8List.sublistView(segment, 4));
      if (orientation != null && orientation != 1) return null;
    } else if (marker != _app13 && marker != _comment) {
      out.add(segment);
    }
    offset = end;
  }
  return null;
}

int? _exifOrientation(Uint8List payload) {
  const header = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  if (payload.length < 14) return null;
  for (var i = 0; i < header.length; i++) {
    if (payload[i] != header[i]) return null;
  }
  final tiff = ByteData.sublistView(payload, 6);
  final Endian endian;
  if (payload[6] == 0x49 && payload[7] == 0x49) {
    endian = Endian.little;
  } else if (payload[6] == 0x4D && payload[7] == 0x4D) {
    endian = Endian.big;
  } else {
    return null;
  }
  final ifd = tiff.getUint32(4, endian);
  if (ifd + 2 > tiff.lengthInBytes) return null;
  final count = tiff.getUint16(ifd, endian);
  for (var i = 0; i < count; i++) {
    final entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.lengthInBytes) return null;
    if (tiff.getUint16(entry, endian) == 0x0112) {
      return tiff.getUint16(entry + 8, endian);
    }
  }
  return null;
}

const _pngMetadataChunks = {'eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'};

/// Losslessly drops EXIF, text and timestamp chunks from a PNG; null when the
/// bytes are not a well-formed PNG.
Uint8List? stripPngMetadata(Uint8List bytes) {
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  if (bytes.length < 8) return null;
  for (var i = 0; i < signature.length; i++) {
    if (bytes[i] != signature[i]) return null;
  }
  final out = BytesBuilder(copy: false)..add(signature);
  var offset = 8;
  while (offset + 12 <= bytes.length) {
    final length = ByteData.sublistView(bytes, offset, offset + 4).getUint32(0);
    final end = offset + 12 + length;
    if (end > bytes.length) return null;
    final type = String.fromCharCodes(bytes.sublist(offset + 4, offset + 8));
    if (!_pngMetadataChunks.contains(type)) {
      out.add(Uint8List.sublistView(bytes, offset, end));
    }
    if (type == 'IEND') return out.takeBytes();
    offset = end;
  }
  return null;
}
