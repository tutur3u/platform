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

  String _calendarLinkPath(String wsId, String mailboxId, String messageId) =>
      '${MailRepository.mailboxPath(wsId, mailboxId)}/messages/'
      '${Uri.encodeComponent(messageId)}/calendar-link';

  Future<Map<String, dynamic>> calendarLink(
    String wsId,
    String mailboxId,
    String messageId,
  ) => _invitationApi.getJson(_calendarLinkPath(wsId, mailboxId, messageId));
  Future<Map<String, dynamic>> previewCalendarLink(
    String wsId,
    String mailboxId,
    String messageId,
    Map<String, dynamic> selection,
  ) => _invitationApi.postJson(
    '${_calendarLinkPath(wsId, mailboxId, messageId)}/preview',
    selection,
  );
  Future<Map<String, dynamic>> confirmCalendarLink(
    String wsId,
    String mailboxId,
    String messageId,
    Map<String, dynamic> selection,
  ) => _invitationApi.putJson(
    _calendarLinkPath(wsId, mailboxId, messageId),
    selection,
  );
  Future<Map<String, dynamic>> unlinkCalendarLink(
    String wsId,
    String mailboxId,
    String messageId,
    String receipt,
  ) => _invitationApi.deleteJson(
    _calendarLinkPath(wsId, mailboxId, messageId),
    body: {'receipt': receipt},
  );
}
