import 'package:equatable/equatable.dart';

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

String? _text(Object? value) {
  final text = value is String ? value.trim() : '';
  return text.isEmpty ? null : text;
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

/// A workspace member as the task routes name them (co-member name, with
/// the server's own fallback).
class TaskPerson extends Equatable {
  const TaskPerson({required this.id, this.displayName, this.avatarUrl});

  factory TaskPerson.fromJson(Map<String, dynamic> json) => TaskPerson(
    id: json['id']?.toString() ?? '',
    displayName: _text(json['display_name']),
    avatarUrl: _text(json['avatar_url']),
  );

  static TaskPerson? maybe(Object? value) {
    final json = _map(value);
    return json['id'] == null ? null : TaskPerson.fromJson(json);
  }

  final String id;
  final String? displayName;
  final String? avatarUrl;

  @override
  List<Object?> get props => [id, displayName, avatarUrl];
}

/// A comment on a task. Imported comments carry an external author instead
/// of a member.
class TaskComment extends Equatable {
  const TaskComment({
    required this.id,
    required this.body,
    this.author,
    this.externalAuthor,
    this.externalUrl,
    this.createdAt,
    this.editedAt,
  });

  factory TaskComment.fromJson(Map<String, dynamic> json) => TaskComment(
    id: json['id']?.toString() ?? '',
    body: json['body']?.toString() ?? '',
    author: TaskPerson.maybe(json['author']),
    externalAuthor: _text(json['external_author']),
    externalUrl: _text(json['external_url']),
    createdAt: _date(json['created_at']),
    editedAt: _date(json['edited_at']),
  );

  final String id;
  final String body;
  final TaskPerson? author;
  final String? externalAuthor;
  final String? externalUrl;
  final DateTime? createdAt;
  final DateTime? editedAt;

  @override
  List<Object?> get props => [
    id,
    body,
    author,
    externalAuthor,
    externalUrl,
    createdAt,
    editedAt,
  ];
}

/// Link kinds in the order web groups them.
enum TaskLinkKind { pullRequest, commit, ciRun, issue, doc, url }

TaskLinkKind _linkKind(Object? value) => switch (value) {
  'pull_request' => TaskLinkKind.pullRequest,
  'commit' => TaskLinkKind.commit,
  'ci_run' => TaskLinkKind.ciRun,
  'issue' => TaskLinkKind.issue,
  'doc' => TaskLinkKind.doc,
  _ => TaskLinkKind.url,
};

enum TaskLinkState {
  open,
  closed,
  merged,
  draft,
  success,
  failure,
  pending,
  cancelled,
}

/// A linked resource: a pull request, commit, CI run, issue, doc or link.
class TaskLink extends Equatable {
  const TaskLink({
    required this.url,
    required this.kind,
    this.id,
    this.legacy = false,
    this.externalId,
    this.title,
    this.state,
  });

  factory TaskLink.fromJson(Map<String, dynamic> json) => TaskLink(
    id: _text(json['id']),
    url: json['url']?.toString() ?? '',
    kind: _linkKind(json['kind']),
    legacy: json['legacy'] == true,
    externalId: _text(json['external_id']),
    title: _text(json['title']),
    state: TaskLinkState.values
        .where((state) => state.name == json['state'])
        .firstOrNull,
  );

  /// Null for a legacy `task_resources` entry, which has no link row.
  final String? id;
  final String url;
  final TaskLinkKind kind;

  /// Edited through the task's links field, so it cannot be removed here.
  final bool legacy;
  final String? externalId;
  final String? title;
  final TaskLinkState? state;

  /// The link's label as web shows it: its title, a short commit hash or
  /// `#number`, else the address without `https://`.
  String get label {
    if (title case final title?) return title;
    if (externalId case final id?) {
      return kind == TaskLinkKind.commit
          ? id.substring(0, id.length < 7 ? id.length : 7)
          : '#$id';
    }
    return url.replaceFirst(RegExp('^https://'), '');
  }

  bool get removable => !legacy && id != null;

  @override
  List<Object?> get props => [id, url, kind, legacy, externalId, title, state];
}

/// One entry of the task's merged timeline: history, comments and links.
class TaskTimelineEvent extends Equatable {
  const TaskTimelineEvent({
    required this.id,
    required this.type,
    this.at,
    this.actor,
    this.externalActor,
    this.fieldName,
    this.oldValue,
    this.newValue,
    this.metadata = const {},
    this.comment,
  });

  factory TaskTimelineEvent.fromJson(Map<String, dynamic> json) =>
      TaskTimelineEvent(
        id: json['id']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        at: _date(json['at']),
        actor: TaskPerson.maybe(json['actor']),
        externalActor: _text(json['external_actor']),
        fieldName: _text(json['field_name']),
        oldValue: json['old_value'],
        newValue: json['new_value'],
        metadata: _map(json['metadata']),
        comment: json['comment'] is Map
            ? TaskComment.fromJson(_map(json['comment']))
            : null,
      );

  final String id;
  final String type;
  final DateTime? at;
  final TaskPerson? actor;
  final String? externalActor;
  final String? fieldName;
  final Object? oldValue;
  final Object? newValue;
  final Map<String, dynamic> metadata;
  final TaskComment? comment;

  /// Task changes the history route can restore from; comment, link and
  /// import events have no task fields to restore.
  bool get restorable => const {
    'task_created',
    'field_updated',
    'assignee_added',
    'assignee_removed',
    'label_added',
    'label_removed',
    'project_linked',
    'project_unlinked',
  }.contains(type);

  @override
  List<Object?> get props => [
    id,
    type,
    at,
    actor,
    externalActor,
    fieldName,
    oldValue,
    newValue,
    metadata,
    comment,
  ];
}

/// A page of a cursor-paginated task route.
class TaskPage<T> extends Equatable {
  const TaskPage({required this.items, this.nextCursor});

  final List<T> items;
  final String? nextCursor;

  @override
  List<Object?> get props => [items, nextCursor];
}
