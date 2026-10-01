part of 'mail_repository.dart';

abstract class MailInvitationRepository {
  ApiClient get _invitationApi;

  Future<Map<String, dynamic>?> invitation(
    String wsId,
    String mailboxId,
    String messageId,
  ) async {
    final result = await _invitationApi.getJson(
      '${MailRepository.mailboxPath(wsId, mailboxId)}/messages/'
      '${Uri.encodeComponent(messageId)}/invitation',
    );
    return result['invitation'] as Map<String, dynamic>?;
  }

  // Online replies reuse the caller's request identity on retry.
  Future<Map<String, dynamic>> respondToInvitation(
    String wsId,
    String mailboxId,
    String messageId, {
    required String response,
    required String requestId,
  }) => _invitationApi.postJson(
    '${MailRepository.mailboxPath(wsId, mailboxId)}/messages/'
    '${Uri.encodeComponent(messageId)}/invitation',
    {'response': response, 'requestId': requestId},
  );
}
