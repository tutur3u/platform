enum CacheEntryState { missing, fresh, stale, expired }

class CachedResourceRecord {
  const CachedResourceRecord({
    required this.key,
    required this.namespace,
    required this.jsonPayload,
    required this.fetchedAt,
    required this.staleAt,
    required this.expireAt,
    this.userId,
    this.workspaceId,
    this.locale,
    this.schemaVersion = 1,
    this.etag,
    this.tags = const <String>[],
    this.params = const <String, String>{},
  });

  factory CachedResourceRecord.fromJson(Map<dynamic, dynamic> json) {
    return CachedResourceRecord(
      key: json['key'] as String,
      namespace: json['namespace'] as String,
      jsonPayload: json['jsonPayload'] as String,
      fetchedAt: DateTime.parse(json['fetchedAt'] as String),
      staleAt: DateTime.parse(json['staleAt'] as String),
      expireAt: DateTime.parse(json['expireAt'] as String),
      userId: json['userId'] as String?,
      workspaceId: json['workspaceId'] as String?,
      locale: json['locale'] as String?,
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      etag: json['etag'] as String?,
      tags: ((json['tags'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<String>()
          .toList(growable: false),
      params: Map<String, String>.from(
        (json['params'] as Map<dynamic, dynamic>?) ?? const {},
      ),
    );
  }

  final String key;
  final String namespace;
  final String jsonPayload;
  final DateTime fetchedAt;
  final DateTime staleAt;
  final DateTime expireAt;
  final String? userId;
  final String? workspaceId;
  final String? locale;
  final int schemaVersion;
  final String? etag;
  final List<String> tags;
  final Map<String, String> params;

  bool get isFresh => DateTime.now().isBefore(staleAt);
  bool get isExpired => !DateTime.now().isBefore(expireAt);

  CachedResourceRecord copyWith({
    String? key,
    String? namespace,
    String? jsonPayload,
    DateTime? fetchedAt,
    DateTime? staleAt,
    DateTime? expireAt,
    Object? userId = _cacheRecordSentinel,
    Object? workspaceId = _cacheRecordSentinel,
    Object? locale = _cacheRecordSentinel,
    int? schemaVersion,
    Object? etag = _cacheRecordSentinel,
    List<String>? tags,
    Map<String, String>? params,
  }) {
    return CachedResourceRecord(
      key: key ?? this.key,
      namespace: namespace ?? this.namespace,
      jsonPayload: jsonPayload ?? this.jsonPayload,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      staleAt: staleAt ?? this.staleAt,
      expireAt: expireAt ?? this.expireAt,
      userId: userId == _cacheRecordSentinel ? this.userId : userId as String?,
      workspaceId: workspaceId == _cacheRecordSentinel
          ? this.workspaceId
          : workspaceId as String?,
      locale: locale == _cacheRecordSentinel ? this.locale : locale as String?,
      schemaVersion: schemaVersion ?? this.schemaVersion,
      etag: etag == _cacheRecordSentinel ? this.etag : etag as String?,
      tags: tags ?? this.tags,
      params: params ?? this.params,
    );
  }

  CacheEntryState get state {
    if (isExpired) return CacheEntryState.expired;
    if (isFresh) return CacheEntryState.fresh;
    return CacheEntryState.stale;
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    'namespace': namespace,
    'jsonPayload': jsonPayload,
    'fetchedAt': fetchedAt.toIso8601String(),
    'staleAt': staleAt.toIso8601String(),
    'expireAt': expireAt.toIso8601String(),
    'userId': userId,
    'workspaceId': workspaceId,
    'locale': locale,
    'schemaVersion': schemaVersion,
    'etag': etag,
    'tags': tags,
    'params': params,
  };
}

const _cacheRecordSentinel = Object();

class CacheReadResult<T> {
  const CacheReadResult({
    required this.state,
    this.data,
    this.fetchedAt,
    this.isFromCache = false,
    this.hasValue = false,
  });

  final CacheEntryState state;
  final T? data;
  final DateTime? fetchedAt;
  final bool isFromCache;
  final bool hasValue;

  bool get isFresh => state == CacheEntryState.fresh;
  bool get isStale => state == CacheEntryState.stale;
  bool get isExpired => state == CacheEntryState.expired;
}
