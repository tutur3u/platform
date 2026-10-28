import 'package:mobile/features/mastermind/threads/threads_models.dart';

/// V1 snapshot projection. A lane id is never a history reference.
class V1ThreadLane {
  V1ThreadLane(Map<String, dynamic> json, Map<String, dynamic> companion)
    : id = word(json['id']),
      title = word(json['title']).isNotEmpty
          ? word(json['title'])
          : '[${word(json['name'])}] ${word(json['role'])}',
      role = word(json['role']),
      state = word(json['status']).isNotEmpty
          ? word(json['status'])
          : word(companion['status']).isNotEmpty
          ? word(companion['status'])
          : word(json['state']),
      topLevel = json['top_level'] == true;
  final String id;
  final String title;
  final String role;
  final String state;
  final bool topLevel;
  bool matches(String query, String? filter) =>
      (filter == null || state == filter) &&
      '$title $role'.toLowerCase().contains(query.toLowerCase());
}

class V1Threads {
  V1Threads(Map<String, dynamic> json) {
    final work = object(json['work']);
    final companions = {
      for (final value in array(work['lanes']))
        word(object(value)['id']): object(value),
    };
    lanes = [
      for (final value in array(json['lanes']))
        if (RegExp(r'^item-[a-f0-9]{20}$').hasMatch(word(object(value)['id'])))
          V1ThreadLane(
            object(value),
            companions[word(object(value)['id'])] ?? {},
          ),
    ];
    counts = {
      for (final state in ['running', 'waiting', 'idle'])
        state: object(work['counts'])[state] is int
            ? object(work['counts'])[state] as int
            : lanes.where((lane) => lane.state == state).length,
    };
  }
  late final List<V1ThreadLane> lanes;
  late final Map<String, int> counts;
}
