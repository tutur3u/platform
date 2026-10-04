import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_sfu.dart';

class FixturePeer implements RTCPeerConnection {
  int disposed = 0;
  @override
  Future<void> dispose() async {
    disposed++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FixtureRenderer implements RTCVideoRenderer {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'failed local stream allocation releases the already allocated peer',
    () async {
      final peer = FixturePeer();
      final sfu = MeetFixtureSfu(
        FixtureRenderer(),
        createPeer: (_) async => peer,
        createStream: (_) async =>
            throw StateError('Synthetic allocation failure'),
      );
      await expectLater(
        sfu.request({'type': 'sfu.session.create'}),
        throwsStateError,
      );
      expect(peer.disposed, 1);
      await sfu.close();
      expect(peer.disposed, 1);
    },
  );
}
