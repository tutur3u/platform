import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/data/meet_room_code.dart';

void main() {
  test('native Meet codes round-trip the web room format', () {
    const id = '5e5217de-1234-4abc-89de-1234567890ab';
    final code = encodeMeetRoomCode(id);
    expect(code.split('-').map((part) => part.length), [9, 9, 8]);
    expect(decodeMeetRoomCode(code), id);
    expect(decodeMeetRoomCode(code.toUpperCase().replaceAll('-', '')), id);
    expect(decodeMeetRoomCode(id), id);
    expect(decodeMeetRoomCode('not-a-room'), isNull);
  });
}
