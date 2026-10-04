import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_server.dart';

class MeetFixtureRepository extends MeetRepository {
  MeetFixtureRepository(this.server);
  final MeetFixtureServer server;
  @override
  Future<Map<String, dynamic>> createRealtimeSession(
    String wsId,
    String meetingId, {
    String? deviceId,
    String? joinMode,
  }) => server.createSession(wsId, meetingId);
}
