import 'package:flutter/foundation.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/meet/data/meet_ai_consent.dart';

class MeetRoomAssistant extends ChangeNotifier {
  MeetRoomAssistant({
    required this.workspaceId,
    required this.meetingId,
    required MeetRepository repository,
    Future<String> Function()? timezoneLoader,
  }) : _repository = repository,
       _timezoneLoader = timezoneLoader ?? getCurrentTimezoneIdentifier;

  final String workspaceId;
  final String meetingId;
  final MeetRepository _repository;
  final Future<String> Function() _timezoneLoader;
  final reviews = <Map<String, dynamic>>[];
  bool thinking = false;
  bool loadingReviews = false;
  String? error;
  String? retryMessageId;
  bool _disposed = false;

  /// Checked before every Mira request; null sends as before.
  MiraAiConsentGate? aiConsentGate;

  bool get consentRequired => error == meetAiConsentRequiredError;

  /// Whether a room message mentioning Mira may be sent, asking the user for
  /// AI data consent when needed.
  Future<bool> admitAiConsent() => admitMeetAiConsent(aiConsentGate);

  static bool hasMention(String body) => RegExp(
    r'(^|[\s\(\[\{\"\x27,:;!?])@(?:mira|ttr|tuturuuu)(?=$|[^a-zA-Z0-9_-])',
    caseSensitive: false,
    multiLine: true,
  ).hasMatch(body);

  Future<void> ask(String messageId) async {
    if (thinking) return;
    if (!await admitAiConsent()) {
      // Not now sends nothing; Retry asks again.
      if (!_disposed) {
        retryMessageId = messageId;
        error = meetAiConsentRequiredError;
        notifyListeners();
      }
      return;
    }
    if (_disposed || thinking) return;
    thinking = true;
    retryMessageId = messageId;
    error = null;
    notifyListeners();
    try {
      await _repository.askRoomMira(
        workspaceId,
        meetingId,
        messageId: messageId,
        timezone: await _timezoneLoader(),
      );
      await refreshReviews();
      if (!_disposed) retryMessageId = null;
    } on MeetAiConsentRequiredException {
      // Kept for Retry; the refused request is not sent again by itself.
      if (!_disposed) {
        error = meetAiConsentRequiredError;
        aiConsentGate?.consentRequired();
      }
    } on Object {
      if (!_disposed) error = 'generation_failed';
    } finally {
      if (!_disposed) {
        thinking = false;
        notifyListeners();
      }
    }
  }

  Future<void> refreshReviews() async {
    if (loadingReviews) return;
    loadingReviews = true;
    notifyListeners();
    try {
      final listed = await _repository.listMiraReviews(workspaceId, meetingId);
      if (_disposed) return;
      final details = await Future.wait(
        listed
            .whereType<Map<dynamic, dynamic>>()
            .take(20)
            .map((entry) => entry['id'])
            .whereType<String>()
            .map(
              (id) async => {
                ...await _repository.getMiraReview(workspaceId, meetingId, id),
                'id': id,
              },
            ),
      );
      if (_disposed) return;
      reviews
        ..clear()
        ..addAll(details);
      error = null;
    } on Object {
      if (!_disposed) error = 'reviews_failed';
    } finally {
      if (!_disposed) {
        loadingReviews = false;
        notifyListeners();
      }
    }
  }

  /// Sends a review decision; false when the user chose Not now on the
  /// consent sheet and nothing was sent. Throws
  /// [MeetAiConsentRequiredException] when the server refused for missing
  /// consent, after asking the user again.
  Future<bool> decide({
    required String messageId,
    required int revision,
    required String action,
  }) async {
    // The Meet gateway refuses every review decision without consent.
    if (!await admitAiConsent()) return false;
    try {
      await _repository.decideMiraReview(
        workspaceId,
        meetingId,
        messageId: messageId,
        revision: revision,
        action: action,
      );
    } on MeetAiConsentRequiredException {
      aiConsentGate?.consentRequired();
      rethrow;
    }
    await refreshReviews();
    return true;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
