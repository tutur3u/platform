import 'package:equatable/equatable.dart';

int _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

double _asDouble(Object? value) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

String? _asString(Object? value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  return null;
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, val) => MapEntry(key.toString(), val));
  }
  return const <String, dynamic>{};
}

class DriveMetricFile extends Equatable {
  const DriveMetricFile({
    required this.name,
    required this.size,
    this.createdAt,
  });

  factory DriveMetricFile.fromJson(Map<String, dynamic> json) {
    return DriveMetricFile(
      name: _asString(json['name']) ?? 'Unknown file',
      size: _asInt(json['size']),
      createdAt: _asString(json['createdAt']),
    );
  }

  final String name;
  final int size;
  final String? createdAt;

  @override
  List<Object?> get props => [name, size, createdAt];
}

class DriveAnalytics extends Equatable {
  const DriveAnalytics({
    required this.totalSize,
    required this.fileCount,
    required this.storageLimit,
    required this.usagePercentage,
    this.largestFile,
    this.smallestFile,
  });

  factory DriveAnalytics.fromJson(Map<String, dynamic> json) {
    return DriveAnalytics(
      totalSize: _asInt(json['totalSize']),
      fileCount: _asInt(json['fileCount']),
      storageLimit: _asInt(json['storageLimit']),
      usagePercentage: _asDouble(json['usagePercentage']),
      largestFile: json['largestFile'] is Map<String, dynamic>
          ? DriveMetricFile.fromJson(
              json['largestFile'] as Map<String, dynamic>,
            )
          : null,
      smallestFile: json['smallestFile'] is Map<String, dynamic>
          ? DriveMetricFile.fromJson(
              json['smallestFile'] as Map<String, dynamic>,
            )
          : null,
    );
  }

  final int totalSize;
  final int fileCount;
  final int storageLimit;
  final double usagePercentage;
  final DriveMetricFile? largestFile;
  final DriveMetricFile? smallestFile;

  @override
  List<Object?> get props => [
    totalSize,
    fileCount,
    storageLimit,
    usagePercentage,
    largestFile,
    smallestFile,
  ];
}

class DriveEntry extends Equatable {
  const DriveEntry({
    required this.name,
    required this.isFolder,
    this.id,
    this.createdAt,
    this.updatedAt,
    this.lastAccessedAt,
    this.size = 0,
    this.contentType,
    this.metadata = const <String, dynamic>{},
  });

  factory DriveEntry.fromJson(Map<String, dynamic> json) {
    final metadata = _asMap(json['metadata']);
    return DriveEntry(
      id: _asString(json['id']),
      name: _asString(json['name']) ?? 'Untitled',
      isFolder: _asString(json['id']) == null,
      createdAt: _asString(json['created_at']),
      updatedAt: _asString(json['updated_at']),
      lastAccessedAt: _asString(json['last_accessed_at']),
      size: _asInt(metadata['size'] ?? metadata['fileSize']),
      contentType: _asString(
        metadata['mimetype'] ?? metadata['contentType'] ?? metadata['type'],
      ),
      metadata: metadata,
    );
  }

  final String? id;
  final String name;
  final bool isFolder;
  final String? createdAt;
  final String? updatedAt;
  final String? lastAccessedAt;
  final int size;
  final String? contentType;
  final Map<String, dynamic> metadata;

  @override
  List<Object?> get props => [
    id,
    name,
    isFolder,
    createdAt,
    updatedAt,
    lastAccessedAt,
    size,
    contentType,
    metadata,
  ];
}

class DriveListResult extends Equatable {
  const DriveListResult({
    required this.entries,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory DriveListResult.fromJson(Map<String, dynamic> json) {
    final pagination = _asMap(json['pagination']);
    return DriveListResult(
      entries: (json['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(DriveEntry.fromJson)
          .toList(growable: false),
      total: _asInt(pagination['total']),
      limit: _asInt(pagination['limit']),
      offset: _asInt(pagination['offset']),
    );
  }

  final List<DriveEntry> entries;
  final int total;
  final int limit;
  final int offset;

  @override
  List<Object?> get props => [entries, total, limit, offset];
}

class DriveExportFile extends Equatable {
  const DriveExportFile({
    required this.path,
    required this.relativePath,
    required this.url,
    this.size = 0,
    this.contentType,
  });

  factory DriveExportFile.fromJson(Map<String, dynamic> json) {
    return DriveExportFile(
      path: _asString(json['path']) ?? '',
      relativePath: _asString(json['relativePath']) ?? '',
      url: _asString(json['url']) ?? '',
      size: _asInt(json['size']),
      contentType: _asString(json['contentType']),
    );
  }

  final String path;
  final String relativePath;
  final String url;
  final int size;
  final String? contentType;

  @override
  List<Object?> get props => [path, relativePath, url, size, contentType];
}

class DriveExportLinks extends Equatable {
  const DriveExportLinks({
    required this.folderName,
    required this.folderPath,
    required this.generatedAt,
    required this.files,
    required this.assetUrls,
    this.indexFile,
    this.entryUrl,
  });

  factory DriveExportLinks.fromJson(Map<String, dynamic> json) {
    final loaderManifest = _asMap(json['loaderManifest']);
    final assetUrls =
        (loaderManifest['assetUrls'] as Map<dynamic, dynamic>? ??
                const <dynamic, dynamic>{})
            .map((key, value) => MapEntry(key.toString(), value.toString()));

    return DriveExportLinks(
      folderName: _asString(json['folderName']) ?? '',
      folderPath: _asString(json['folderPath']) ?? '',
      generatedAt: _asString(json['generatedAt']) ?? '',
      files: (json['files'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(DriveExportFile.fromJson)
          .toList(growable: false),
      assetUrls: assetUrls,
      indexFile: json['indexFile'] is Map<String, dynamic>
          ? DriveExportFile.fromJson(json['indexFile'] as Map<String, dynamic>)
          : null,
      entryUrl: _asString(loaderManifest['entryUrl']),
    );
  }

  final String folderName;
  final String folderPath;
  final String generatedAt;
  final List<DriveExportFile> files;
  final Map<String, String> assetUrls;
  final DriveExportFile? indexFile;
  final String? entryUrl;

  @override
  List<Object?> get props => [
    folderName,
    folderPath,
    generatedAt,
    files,
    assetUrls,
    indexFile,
    entryUrl,
  ];
}

class DriveUploadResult extends Equatable {
  const DriveUploadResult({
    required this.path,
    this.fullPath,
    this.autoExtractStatus,
    this.autoExtractMessage,
  });

  final String path;
  final String? fullPath;
  final String? autoExtractStatus;
  final String? autoExtractMessage;

  @override
  List<Object?> get props => [
    path,
    fullPath,
    autoExtractStatus,
    autoExtractMessage,
  ];
}
