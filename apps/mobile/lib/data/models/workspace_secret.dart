/// Server-assigned sensitivity of a workspace secret.
const workspaceSecretTierConfig = 'config';
const workspaceSecretTierCredential = 'credential';

class WorkspaceSecret {
  const WorkspaceSecret({
    this.id,
    this.wsId,
    this.name,
    this.value,
    this.createdAt,
    this.tier,
    bool? valueSet,
    this.valueMasked = false,
  }) : _valueSet = valueSet;

  factory WorkspaceSecret.fromJson(Map<String, dynamic> json) {
    final masked = json['value_masked'] == true;
    final rawValueSet = json['value_set'];
    return WorkspaceSecret(
      id: _readString(json['id']),
      wsId: _readString(json['ws_id']),
      name: _readString(json['name']),
      // A masked row never carries a usable value, whatever the payload says.
      value: masked ? null : _readNullableString(json['value']),
      createdAt: _readDateTime(json['created_at']),
      tier: _readString(json['tier']),
      valueSet: rawValueSet is bool ? rawValueSet : null,
      valueMasked: masked,
    );
  }

  final String? id;
  final String? wsId;
  final String? name;

  /// Plain value; always null for masked (credential) rows.
  final String? value;
  final DateTime? createdAt;

  /// `config` or `credential`; null when the server predates tiers.
  final String? tier;

  /// The server withheld the value; only [valueSet] is known.
  final bool valueMasked;

  final bool? _valueSet;

  /// Whether the server stores a value, falling back to a non-empty [value].
  bool get valueSet => _valueSet ?? (value?.isNotEmpty ?? false);

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'ws_id': wsId,
      'name': name,
      'value': value,
      'created_at': createdAt?.toIso8601String(),
      'tier': tier,
      'value_set': _valueSet,
      'value_masked': valueMasked,
    };
  }

  WorkspaceSecret copyWith({
    String? id,
    String? wsId,
    String? name,
    String? value,
    DateTime? createdAt,
    String? tier,
    bool? valueSet,
    bool? valueMasked,
  }) {
    return WorkspaceSecret(
      id: id ?? this.id,
      wsId: wsId ?? this.wsId,
      name: name ?? this.name,
      value: value ?? this.value,
      createdAt: createdAt ?? this.createdAt,
      tier: tier ?? this.tier,
      valueSet: valueSet ?? (value != null ? value.isNotEmpty : _valueSet),
      valueMasked: valueMasked ?? this.valueMasked,
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
