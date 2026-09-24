const _alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
final _uuidPattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

String? decodeMeetRoomCode(String code) {
  final trimmed = code.trim();
  if (_uuidPattern.hasMatch(trimmed)) return trimmed.toLowerCase();
  final normalized = trimmed
      .toUpperCase()
      .replaceAll(RegExp(r'[\s-]'), '')
      .replaceAll(RegExp('[IL]'), '1')
      .replaceAll('O', '0')
      .replaceAll('U', 'V');
  if (normalized.length != 26) return null;
  var value = BigInt.zero;
  for (final character in normalized.split('')) {
    final digit = _alphabet.indexOf(character);
    if (digit < 0) return null;
    value = (value << 5) | BigInt.from(digit);
  }
  final hex = (value >> 2).toRadixString(16).padLeft(32, '0');
  if (hex.length != 32) return null;
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

String encodeMeetRoomCode(String meetingId) {
  if (!_uuidPattern.hasMatch(meetingId)) {
    throw ArgumentError.value(meetingId, 'meetingId', 'Expected a UUID');
  }
  final value = BigInt.parse(meetingId.replaceAll('-', ''), radix: 16) << 2;
  final code = StringBuffer();
  for (var index = 0; index < 26; index++) {
    final digit = ((value >> (125 - index * 5)) & BigInt.from(31)).toInt();
    code.write(_alphabet[digit]);
  }
  final text = code.toString().toLowerCase();
  return '${text.substring(0, 9)}-${text.substring(9, 18)}-'
      '${text.substring(18)}';
}
