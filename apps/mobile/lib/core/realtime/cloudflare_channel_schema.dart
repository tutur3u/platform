/// Mirrors packages/realtime/channels/schema.ts. Keep the cross-client fixture
/// and these checks in step when extending the shared wire protocol.
bool isCloudflareServerFrame(Map<String, dynamic> frame) {
  switch (frame['type']) {
    case 'broadcast':
      final event = frame['event'];
      return frame.length == 3 &&
          frame.containsKey('payload') &&
          event is String &&
          event.isNotEmpty &&
          event.length <= 100;
    case 'presence':
      final state = frame['state'];
      if (frame.length != 2 || state is! Map<String, dynamic>) return false;
      for (final entry in state.entries) {
        if (entry.key.length > 180 || entry.value is! List<dynamic>) {
          return false;
        }
        final sessions = entry.value as List<dynamic>;
        if (sessions.length > 128) return false;
        for (final session in sessions) {
          if (session is! Map<String, dynamic>) return false;
          final reference = session['presence_ref'];
          if (reference is! String || reference.length > 64) return false;
        }
      }
      return true;
    default:
      return false;
  }
}
