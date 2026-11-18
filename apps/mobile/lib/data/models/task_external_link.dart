import 'package:equatable/equatable.dart';

/// One external reference of a task: a pull request, commit, thread or any
/// other link, as `{kind, url, label}`.
class TaskExternalLink extends Equatable {
  const TaskExternalLink({required this.kind, required this.url, this.label});

  /// The link for a JSON object, or null when it has no `url`.
  static TaskExternalLink? tryFromJson(Object? json) {
    if (json is! Map || json['url'] is! String) return null;
    final url = (json['url'] as String).trim();
    if (url.isEmpty) return null;
    final kind = json['kind'];
    final label = json['label'];
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
