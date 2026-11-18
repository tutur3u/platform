import 'package:equatable/equatable.dart';

/// One external reference of a task: a pull request, commit, thread or any
/// other link, as `{kind, url, title}` (`label` is read as a fallback).
class TaskExternalLink extends Equatable {
  const TaskExternalLink({required this.kind, required this.url, this.label});

  /// The link for a JSON object, or null when it has no `url`.
  static TaskExternalLink? tryFromJson(Object? json) {
    if (json is! Map || json['url'] is! String) return null;
    final url = (json['url'] as String).trim();
    if (url.isEmpty) return null;
    final kind = json['kind'];
    final label = json['title'] ?? json['label'];
    return TaskExternalLink(
      kind: kind is String && kind.trim().isNotEmpty
          ? kind.trim().toLowerCase()
          : 'link',
      url: url,
      label: label is String && label.trim().isNotEmpty ? label.trim() : null,
    );
  }

  final String kind;
  final String url;
  final String? label;

  Map<String, dynamic> toJson() => {
    'kind': kind,
    'url': url,
    if (label != null) 'label': label,
  };

  @override
  List<Object?> get props => [kind, url, label];
}

/// An agent or contact assigned to a task. These are display identities only.
class TaskVirtualAssignee extends Equatable {
  const TaskVirtualAssignee({this.key, this.displayName, this.position = 0});

  /// The assignees in [json], ordered primary first by position.
  static List<TaskVirtualAssignee> listFromJson(Object? json) {
    if (json is! List<dynamic>) return const [];
    final items = <TaskVirtualAssignee>[];
    for (final entry in json) {
      if (entry is! Map) continue;
      final key = entry['key'];
      final name = entry['display_name'];
      final position = entry['position'];
      final assignee = TaskVirtualAssignee(
        key: key is String && key.trim().isNotEmpty ? key.trim() : null,
        displayName: name is String && name.trim().isNotEmpty
            ? name.trim()
            : null,
        position: position is int ? position : 0,
      );
      if (assignee.key != null || assignee.displayName != null) {
        items.add(assignee);
      }
    }
    items.sort((a, b) => a.position.compareTo(b.position));
    return List.unmodifiable(items);
  }

  final String? key;
  final String? displayName;
  final int position;

  @override
  List<Object?> get props => [key, displayName, position];
}
