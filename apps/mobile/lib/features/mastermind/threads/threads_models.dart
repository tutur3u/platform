Map<String, dynamic> object(Object? value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};
String word(Object? value) => value is String ? value : '';
List<dynamic> array(Object? value) => value is List ? value : <dynamic>[];

const mastermindThreadsEnabled = bool.fromEnvironment('MASTERMIND_THREADS');

class ThreadEntry {
  ThreadEntry.fromJson(Map<String, dynamic> json)
    : ref = word(json['thread_ref']),
      title = word(json['title']),
      role = word(json['role']),
      product = word(json['product']),
      state = word(json['state']),
      digest = word(json['history_digest']),
      history = word(json['history']),
      preview = word(json['preview']);
  final String ref;
  final String title;
  final String role;
  final String product;
  final String state;
  final String digest;
  final String history;
  final String preview;
  String get group => switch (state) {
    'queued' || 'running' => 'running',
    'waiting' => 'waiting',
    'failed' => 'failed',
    _ => 'idle',
  };
  bool matches(String query, String? filter) =>
      (filter == null || group == filter) &&
      '$title $role $product'.toLowerCase().contains(query.toLowerCase());
}

class ThreadMessage {
  ThreadMessage.fromJson(Map<String, dynamic> json)
    : ref = word(json['msg_ref']),
      author = word(json['author_label']),
      text = word(json['text']),
      withheld = json['withheld'] == true,
      truncated = json['truncated'] == true;
  final String ref;
  final String author;
  final String text;
  final bool withheld;
  final bool truncated;
}

class ThreadPage {
  ThreadPage.fromJson(Map<String, dynamic> json)
    : digest = word(json['history_digest']),
      messages = array(
        json['messages'],
      ).map((v) => ThreadMessage.fromJson(object(v))).toList(),
      before = word(json['next_before']),
      more = json['more'] == true;
  final String digest;
  final String before;
  final List<ThreadMessage> messages;
  final bool more;
}
