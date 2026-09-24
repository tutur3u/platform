import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/meet/data/meet_room_audio.dart';

class _FakePlayer extends AssistantLiveAudioPlayer {
  final chunks = <Uint8List>[];
  int clears = 0;
  int pauses = 0;
  int disposals = 0;

  @override
  Future<void> play(Uint8List bytes) async => chunks.add(bytes);

  @override
  Future<void> clear() async => clears++;

  @override
  Future<void> pause() async => pauses++;

  @override
  Future<void> dispose() async => disposals++;
}

void main() {
  test(
    'plays only ordered room Mira audio and keeps the mic independent',
    () async {
      final player = _FakePlayer();
      final audio = MeetRoomAudio(player: player, nowMillis: () => 10000)
        ..handle({
          'type': 'assistant.live',
          'sessionId': 'room-mira',
          'active': true,
        });
      expect(audio.sessionId, 'room-mira');

      void packet(int sequence, {String id = 'room-mira', int at = 9500}) =>
          audio.handle({
            'type': 'assistant.audio',
            'sessionId': id,
            'sequence': sequence,
            'at': at,
            'data': base64Encode([1, 0, 2, 0]),
          });

      packet(1);
      packet(1);
      packet(2, id: 'another-session');
      packet(2, at: 1000);
      await Future<void>.delayed(Duration.zero);
      expect(player.chunks, hasLength(1));
      expect(player.chunks.single, [1, 0, 2, 0]);

      audio.handle({'type': 'assistant.interrupted', 'sessionId': 'room-mira'});
      await Future<void>.delayed(Duration.zero);
      expect(player.clears, 1);
      audio.setEnabled(value: false);
      packet(3);
      await Future<void>.delayed(Duration.zero);
      expect(player.chunks, hasLength(1));
      expect(player.pauses, 1);
      audio.setEnabled(value: true);
      packet(3);
      await Future<void>.delayed(Duration.zero);
      expect(player.chunks, hasLength(2));
      audio.dispose();
    },
  );

  test('clears audio on Mira stop, reconnect, and room disposal', () async {
    final player = _FakePlayer();
    final audio = MeetRoomAudio(player: player)
      ..handle({
        'type': 'assistant.live',
        'sessionId': 'room-mira',
        'active': true,
      })
      ..handle({
        'type': 'assistant.live',
        'sessionId': 'other',
        'active': false,
      });
    expect(audio.sessionId, 'room-mira');
    audio.handle({'type': 'ready'});
    await Future<void>.delayed(Duration.zero);
    expect(audio.sessionId, isNull);
    expect(player.pauses, 1);
    audio.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(player.disposals, 1);
  });
}
