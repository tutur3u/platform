import 'package:mobile/features/documents/document_mention_source.dart';
import 'package:mobile/features/documents/document_mentions.dart';

/// A mention source with fixed entities. The first [failures] loads fail,
/// and every task search answers [found].
class FakeMentionSource implements DocumentMentionSource {
  FakeMentionSource(this.options, {this.failures = 0, this.found = const []});

  final List<DocumentMentionOption> options;
  final List<DocumentMentionOption> found;
  int failures;
  int loads = 0;
  final List<String> queries = [];

  @override
  Future<List<DocumentMentionOption>> load() async {
    loads++;
    if (loads <= failures) throw StateError('offline');
    return options;
  }

  @override
  Future<List<DocumentMentionOption>> searchTasks(String query) async {
    queries.add(query);
    return found;
  }
}
