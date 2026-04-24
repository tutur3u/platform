import 'package:equatable/equatable.dart';

String _stringValue(Object? value, {String fallback = ''}) {
  if (value is String) return value;
  return fallback;
}

String? _nullableString(Object? value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : value;
  }
  return null;
}

int _intValue(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

bool _boolValue(Object? value) {
  if (value is bool) return value;
  if (value is String) return value.toLowerCase() == 'true';
  return false;
}

Map<String, dynamic> _mapValue(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, val) => MapEntry(key.toString(), val));
  }
  return const <String, dynamic>{};
}

List<Map<String, dynamic>> _mapList(Object? value) {
  return (value as List<dynamic>? ?? const <dynamic>[])
      .whereType<Map<String, dynamic>>()
      .toList(growable: false);
}

class CmsSummaryCounts extends Equatable {
  const CmsSummaryCounts({
    required this.collections,
    required this.entries,
    required this.drafts,
    required this.scheduled,
    required this.published,
    required this.archived,
  });

  factory CmsSummaryCounts.fromJson(Map<String, dynamic> json) {
    return CmsSummaryCounts(
      collections: _intValue(json['collections']),
      entries: _intValue(json['entries']),
      drafts: _intValue(json['drafts']),
      scheduled: _intValue(json['scheduled']),
      published: _intValue(json['published']),
      archived: _intValue(json['archived']),
    );
  }

  final int collections;
  final int entries;
  final int drafts;
  final int scheduled;
  final int published;
  final int archived;

  @override
  List<Object?> get props => [
    collections,
    entries,
    drafts,
    scheduled,
    published,
    archived,
  ];
}

class CmsSummaryCollection extends Equatable {
  const CmsSummaryCollection({
    required this.id,
    required this.slug,
    required this.title,
    required this.totalEntries,
    required this.draftEntries,
    required this.scheduledEntries,
    required this.publishedEntries,
    required this.archivedEntries,
    required this.isEnabled,
  });

  factory CmsSummaryCollection.fromJson(Map<String, dynamic> json) {
    return CmsSummaryCollection(
      id: _stringValue(json['id']),
      slug: _stringValue(json['slug']),
      title: _stringValue(json['title'], fallback: 'Untitled collection'),
      totalEntries: _intValue(json['totalEntries']),
      draftEntries: _intValue(json['draftEntries']),
      scheduledEntries: _intValue(json['scheduledEntries']),
      publishedEntries: _intValue(json['publishedEntries']),
      archivedEntries: _intValue(json['archivedEntries']),
      isEnabled: _boolValue(json['isEnabled']),
    );
  }

  final String id;
  final String slug;
  final String title;
  final int totalEntries;
  final int draftEntries;
  final int scheduledEntries;
  final int publishedEntries;
  final int archivedEntries;
  final bool isEnabled;

  @override
  List<Object?> get props => [
    id,
    slug,
    title,
    totalEntries,
    draftEntries,
    scheduledEntries,
    publishedEntries,
    archivedEntries,
    isEnabled,
  ];
}

class CmsAttentionItem extends Equatable {
  const CmsAttentionItem({
    required this.entryId,
    required this.collectionTitle,
    required this.title,
    required this.detail,
    required this.status,
    this.summary,
    this.scheduledFor,
  });

  factory CmsAttentionItem.fromJson(Map<String, dynamic> json) {
    return CmsAttentionItem(
      entryId: _stringValue(json['entryId']),
      collectionTitle: _stringValue(json['collectionTitle']),
      title: _stringValue(json['title'], fallback: 'Untitled entry'),
      detail: _stringValue(json['detail']),
      status: _stringValue(json['status'], fallback: 'draft'),
      summary: _nullableString(json['summary']),
      scheduledFor: _nullableString(json['scheduledFor']),
    );
  }

  final String entryId;
  final String collectionTitle;
  final String title;
  final String detail;
  final String status;
  final String? summary;
  final String? scheduledFor;

  @override
  List<Object?> get props => [
    entryId,
    collectionTitle,
    title,
    detail,
    status,
    summary,
    scheduledFor,
  ];
}

class CmsSummary extends Equatable {
  const CmsSummary({
    required this.workspaceId,
    required this.counts,
    required this.collections,
    required this.draftsMissingMedia,
    required this.scheduledSoon,
    required this.archivedBacklog,
    this.adapter,
    this.canonicalProjectId,
  });

  factory CmsSummary.fromJson(Map<String, dynamic> json) {
    final queues = _mapValue(json['queues']);
    return CmsSummary(
      workspaceId: _stringValue(json['workspaceId']),
      adapter: _nullableString(json['adapter']),
      canonicalProjectId: _nullableString(json['canonicalProjectId']),
      counts: CmsSummaryCounts.fromJson(_mapValue(json['counts'])),
      collections: _mapList(
        json['collections'],
      ).map(CmsSummaryCollection.fromJson).toList(growable: false),
      draftsMissingMedia: _mapList(
        queues['draftsMissingMedia'],
      ).map(CmsAttentionItem.fromJson).toList(growable: false),
      scheduledSoon: _mapList(
        queues['scheduledSoon'],
      ).map(CmsAttentionItem.fromJson).toList(growable: false),
      archivedBacklog: _mapList(
        queues['archivedBacklog'],
      ).map(CmsAttentionItem.fromJson).toList(growable: false),
    );
  }

  final String workspaceId;
  final String? adapter;
  final String? canonicalProjectId;
  final CmsSummaryCounts counts;
  final List<CmsSummaryCollection> collections;
  final List<CmsAttentionItem> draftsMissingMedia;
  final List<CmsAttentionItem> scheduledSoon;
  final List<CmsAttentionItem> archivedBacklog;

  @override
  List<Object?> get props => [
    workspaceId,
    adapter,
    canonicalProjectId,
    counts,
    collections,
    draftsMissingMedia,
    scheduledSoon,
    archivedBacklog,
  ];
}

class CmsCollection extends Equatable {
  const CmsCollection({
    required this.id,
    required this.slug,
    required this.title,
    required this.collectionType,
    required this.isEnabled,
    this.description,
  });

  factory CmsCollection.fromJson(Map<String, dynamic> json) {
    return CmsCollection(
      id: _stringValue(json['id']),
      slug: _stringValue(json['slug']),
      title: _stringValue(json['title'], fallback: 'Untitled collection'),
      collectionType: _stringValue(
        json['collection_type'],
        fallback: 'general',
      ),
      description: _nullableString(json['description']),
      isEnabled: _boolValue(json['is_enabled']),
    );
  }

  final String id;
  final String slug;
  final String title;
  final String collectionType;
  final String? description;
  final bool isEnabled;

  @override
  List<Object?> get props => [
    id,
    slug,
    title,
    collectionType,
    description,
    isEnabled,
  ];
}

class CmsEntry extends Equatable {
  const CmsEntry({
    required this.id,
    required this.collectionId,
    required this.slug,
    required this.title,
    required this.status,
    this.subtitle,
    this.summary,
    this.scheduledFor,
    this.publishedAt,
  });

  factory CmsEntry.fromJson(Map<String, dynamic> json) {
    return CmsEntry(
      id: _stringValue(json['id']),
      collectionId: _stringValue(json['collection_id']),
      slug: _stringValue(json['slug']),
      title: _stringValue(json['title'], fallback: 'Untitled entry'),
      status: _stringValue(json['status'], fallback: 'draft'),
      subtitle: _nullableString(json['subtitle']),
      summary: _nullableString(json['summary']),
      scheduledFor: _nullableString(json['scheduled_for']),
      publishedAt: _nullableString(json['published_at']),
    );
  }

  final String id;
  final String collectionId;
  final String slug;
  final String title;
  final String status;
  final String? subtitle;
  final String? summary;
  final String? scheduledFor;
  final String? publishedAt;

  @override
  List<Object?> get props => [
    id,
    collectionId,
    slug,
    title,
    status,
    subtitle,
    summary,
    scheduledFor,
    publishedAt,
  ];
}
