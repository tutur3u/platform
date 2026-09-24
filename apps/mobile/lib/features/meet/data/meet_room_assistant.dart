import 'package:flutter/foundation.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/meet_repository.dart';

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

  static bool hasMention(String body) => RegExp(
    r'(^|[\s\(\[\{\"\x27,:;!?])@(?:mira|ttr|tuturuuu)(?=$|[^a-zA-Z0-9_-])',
    caseSensitive: false,
    multiLine: true,
  ).hasMatch(body);

  Future<void> ask(String messageId) async {
    if (thinking) return;
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

  Future<void> decide({
    required String messageId,
    required int revision,
    required String action,
  }) async {
    await _repository.decideMiraReview(
      workspaceId,
      meetingId,
      messageId: messageId,
      revision: revision,
      action: action,
    );
    await refreshReviews();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
