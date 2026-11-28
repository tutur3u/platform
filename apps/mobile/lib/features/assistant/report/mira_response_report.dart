import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Why a Mira reply is reported. [code] is the server's reason value.
enum MiraResponseReportReason {
  harmful('harmful'),
  hate('hate'),
  inaccurate('inaccurate'),
  sexual('sexual'),
  other('other');

  const MiraResponseReportReason(this.code);
  final String code;

  String label(AppLocalizations l10n) => switch (this) {
    harmful => l10n.miraReportReasonHarmful,
    hate => l10n.miraReportReasonHate,
    inaccurate => l10n.miraReportReasonInaccurate,
    sexual => l10n.miraReportReasonSexual,
    other => l10n.miraReportReasonOther,
  };
}

/// Files "Report this response" for one saved Mira reply.
class MiraResponseReportRepository {
  MiraResponseReportRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  /// The longest details text the server accepts.
  static const maxDetailsLength = 1000;

  final ApiClient _api;

  Future<void> submit({
    required String wsId,
    required String conversationId,
    required String messageId,
    required MiraResponseReportReason reason,
    String? details,
  }) async {
    final note = details?.trim() ?? '';
    await _api.postJson('/api/v1/workspaces/$wsId/chat/reports', {
      'subjectType': 'ai_response',
      'conversationId': conversationId,
      'messageId': messageId,
      'reason': reason.code,
      if (note.isNotEmpty)
        'details': note.length > maxDetailsLength
            ? note.substring(0, maxDetailsLength)
            : note,
    });
  }
}
