class WorkspaceSecret {
  const WorkspaceSecret({
    this.id,
    this.wsId,
    this.name,
    this.value,
    this.createdAt,
  });

  factory WorkspaceSecret.fromJson(Map<String, dynamic> json) {
    return WorkspaceSecret(
      id: _readString(json['id']),
      wsId: _readString(json['ws_id']),
      name: _readString(json['name']),
      value: _readNullableString(json['value']),
      createdAt: _readDateTime(json['created_at']),
    );
  }

  final String? id;
  final String? wsId;
  final String? name;
  final String? value;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'ws_id': wsId,
      'name': name,
      'value': value,
      'created_at': createdAt?.toIso8601String(),
    };
  }

  WorkspaceSecret copyWith({
    String? id,
    String? wsId,
    String? name,
    String? value,
    DateTime? createdAt,
  }) {
    return WorkspaceSecret(
      id: id ?? this.id,
      wsId: wsId ?? this.wsId,
      name: name ?? this.name,
      value: value ?? this.value,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

String? _readString(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return null;
}

String? _readNullableString(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is String) {
    return value;
  }

  return value.toString();
}

DateTime? _readDateTime(Object? value) {
  final raw = _readString(value);
  if (raw == null) {
    return null;
  }
  return DateTime.tryParse(raw);
}
