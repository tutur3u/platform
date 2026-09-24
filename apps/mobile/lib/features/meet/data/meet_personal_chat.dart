import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

class MeetPersonalTurn {
  const MeetPersonalTurn({required this.body, required this.assistant});

  final String body;
  final bool assistant;
}

/// This history stays on this device and is never copied to room chat.
class MeetPersonalChat extends ChangeNotifier {
  MeetPersonalChat({
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
  final turns = <MeetPersonalTurn>[];
  String? error;
  bool pending = false;
  bool _disposed = false;
  ({String question, String requestId, int startedAt})? _retry;

  Future<bool> ask(String rawQuestion) async {
    final question = rawQuestion.trim();
    if (pending || question.isEmpty) return false;
    final retry = _retry?.question == question
        ? _retry!
        : (
            question: question,
            requestId: _newRequestId(),
            startedAt: DateTime.now().millisecondsSinceEpoch,
          );
    _retry = retry;
    pending = true;
    error = null;
    notifyListeners();
    try {
      final answer = await _repository.askPersonalMira(
        workspaceId,
        meetingId,
        requestId: retry.requestId,
        startedAt: retry.startedAt,
        question: question,
        timezone: await _timezoneLoader(),
        history: turns
            .skip(turns.length > 12 ? turns.length - 12 : 0)
            .map(
              (turn) => {
                'body': turn.body.length > 2000
                    ? turn.body.substring(0, 2000)
                    : turn.body,
                'assistant': turn.assistant,
              },
            )
            .toList(),
      );
      if (_disposed) return false;
      turns.addAll([
        MeetPersonalTurn(body: question, assistant: false),
        MeetPersonalTurn(body: answer, assistant: true),
      ]);
      if (turns.length > 40) turns.removeRange(0, turns.length - 40);
      _retry = null;
      return true;
    } on ApiException catch (exception) {
      if (!_disposed) {
        if (exception.statusCode == 422) _retry = null;
        error = 'request_failed';
      }
      return false;
    } on Object {
      if (!_disposed) error = 'request_failed';
      return false;
    } finally {
      if (!_disposed) {
        pending = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  static String _newRequestId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
}
