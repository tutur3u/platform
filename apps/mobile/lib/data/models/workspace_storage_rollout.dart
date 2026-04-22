const workspaceStorageProviderSupabase = 'supabase';
const workspaceStorageProviderR2 = 'r2';

class WorkspaceStorageBackendState {
  const WorkspaceStorageBackendState({
    required this.provider,
    required this.available,
    required this.selected,
    required this.misconfigured,
    this.message,
    this.totalSize,
    this.fileCount,
  });

  factory WorkspaceStorageBackendState.fromJson(Map<String, dynamic> json) {
    final overview = _readMap(json['overview']);
    return WorkspaceStorageBackendState(
      provider:
          _readString(json['provider']) ?? workspaceStorageProviderSupabase,
      available: json['available'] == true,
      selected: json['selected'] == true,
      misconfigured: json['misconfigured'] == true,
      message: _readString(json['message']),
      totalSize: _readInt(overview?['totalSize']),
      fileCount: _readInt(overview?['fileCount']),
    );
  }

  final String provider;
  final bool available;
  final bool selected;
  final bool misconfigured;
  final String? message;
  final int? totalSize;
  final int? fileCount;
}

class WorkspaceStorageAutoExtractState {
  const WorkspaceStorageAutoExtractState({
    required this.enabled,
    required this.configured,
    required this.proxyUrlConfigured,
    required this.proxyTokenConfigured,
  });

  factory WorkspaceStorageAutoExtractState.fromJson(
    Map<String, dynamic> json,
  ) {
    return WorkspaceStorageAutoExtractState(
      enabled: json['enabled'] == true,
      configured: json['configured'] == true,
      proxyUrlConfigured: json['proxyUrlConfigured'] == true,
      proxyTokenConfigured: json['proxyTokenConfigured'] == true,
    );
  }

  final bool enabled;
  final bool configured;
  final bool proxyUrlConfigured;
  final bool proxyTokenConfigured;
}

class WorkspaceStorageRolloutState {
  const WorkspaceStorageRolloutState({
    required this.activeProvider,
    required this.activeProviderMisconfigured,
    required this.backends,
    required this.autoExtract,
  });

  factory WorkspaceStorageRolloutState.fromJson(Map<String, dynamic> json) {
    final backendMap = _readMap(json['backends']) ?? const <String, dynamic>{};
    return WorkspaceStorageRolloutState(
      activeProvider:
          _readString(json['activeProvider']) ??
          workspaceStorageProviderSupabase,
      activeProviderMisconfigured: json['activeProviderMisconfigured'] == true,
      backends: backendMap.map(
        (key, value) => MapEntry(
          key,
          WorkspaceStorageBackendState.fromJson(
            _readMap(value) ?? const <String, dynamic>{},
          ),
        ),
      ),
      autoExtract: WorkspaceStorageAutoExtractState.fromJson(
        _readMap(json['autoExtract']) ?? const <String, dynamic>{},
      ),
    );
  }

  WorkspaceStorageBackendState? backend(String provider) => backends[provider];

  final String activeProvider;
  final bool activeProviderMisconfigured;
  final Map<String, WorkspaceStorageBackendState> backends;
  final WorkspaceStorageAutoExtractState autoExtract;
}

class WorkspaceStorageMigrationResult {
  const WorkspaceStorageMigrationResult({
    required this.sourceProvider,
    required this.targetProvider,
    required this.filesCopied,
    required this.foldersPrepared,
    required this.skipped,
  });

  factory WorkspaceStorageMigrationResult.fromJson(Map<String, dynamic> json) {
    return WorkspaceStorageMigrationResult(
      sourceProvider:
          _readString(json['sourceProvider']) ??
          workspaceStorageProviderSupabase,
      targetProvider:
          _readString(json['targetProvider']) ??
          workspaceStorageProviderSupabase,
      filesCopied: _readInt(json['filesCopied']) ?? 0,
      foldersPrepared: _readInt(json['foldersPrepared']) ?? 0,
      skipped: _readInt(json['skipped']) ?? 0,
    );
  }

  final String sourceProvider;
  final String targetProvider;
  final int filesCopied;
  final int foldersPrepared;
  final int skipped;
}

Map<String, dynamic>? _readMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map(
      (key, entry) => MapEntry(key.toString(), entry),
    );
  }
  return null;
}

String? _readString(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return null;
}

int? _readInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}
