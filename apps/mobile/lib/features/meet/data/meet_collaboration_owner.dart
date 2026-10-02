import 'package:mobile/data/sources/api_client.dart';

/// Pins editor actions and preview responses to the admitted native actor.
class MeetCollaborationOwner {
  MeetCollaborationOwner({
    required this.userId,
    required this.currentUserId,
    required this.isAdmitted,
  });

  final String? userId;
  final String? Function() currentUserId;
  final bool Function() isAdmitted;

  void check() {
    if (userId == null || userId!.isEmpty || currentUserId() != userId) {
      throw const ApiException(
        message: 'Account changed during request',
        statusCode: 401,
      );
    }
    if (!isAdmitted()) {
      throw const ApiException(message: 'Room access denied', statusCode: 403);
    }
  }

  Future<T> run<T>(Future<T> Function() request) async {
    check();
    final result = await request();
    check();
    return result;
  }
}
