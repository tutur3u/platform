import 'dart:convert';
import 'dart:io';

import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/asks/ask_detail_source.dart';

/// The synthetic `GET /v1/asks/<id>` responses, keyed by item id.
Map<String, dynamic> askDetailResponses() {
  final raw = File(
    'test/fixtures/mastermind/ask_details.json',
  ).readAsStringSync();
  return (jsonDecode(raw) as Map<String, dynamic>)['responses']
      as Map<String, dynamic>;
}

/// The fixture body for [id], as the hub would send it.
Map<String, dynamic> askDetailBody(String id) =>
    (askDetailResponses()[id] as Map<String, dynamic>)['body']
        as Map<String, dynamic>;

/// Serves the fixture: 200 parses the body, 404 is withheld, an id outside
/// the fixture is unavailable. Records every requested id.
final class FixtureAskDetailSource implements MastermindAskDetailSource {
  final requested = <String>[];

  @override
  Future<AskDetailFetch> fetch(String itemId) async {
    requested.add(itemId);
    final response = askDetailResponses()[itemId];
    if (response is! Map<String, dynamic>) return const AskDetailUnavailable();
    if (response['status'] == 404) return const AskDetailWithheld();
    final detail = parseAskDetail(response['body']);
    return detail == null
        ? const AskDetailUnavailable()
        : AskDetailFound(detail);
  }
}
