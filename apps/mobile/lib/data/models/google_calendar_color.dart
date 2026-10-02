class GoogleCalendarColorChoice {
  const GoogleCalendarColorChoice({
    required this.connectionId,
    required this.kind,
    this.id,
  });
  final String connectionId;
  final String kind;
  final String? id;
  Map<String, dynamic> toJson() => {
    'connectionId': connectionId,
    'kind': kind,
    if (id != null) 'id': id,
  };
}

class GoogleCalendarColorOption {
  const GoogleCalendarColorOption({
    required this.kind,
    required this.background,
    this.id,
    this.name,
  });
  final String kind;
  final String background;
  final String? id;
  final String? name;
  GoogleCalendarColorChoice choice(String connectionId) =>
      GoogleCalendarColorChoice(connectionId: connectionId, kind: kind, id: id);
}

class GoogleCalendarColorOptions {
  const GoogleCalendarColorOptions({
    required this.connectionId,
    required this.options,
    required this.writesEnabled,
  });
  factory GoogleCalendarColorOptions.fromJson(
    Map<String, dynamic> json,
    String expectedConnectionId,
  ) {
    if (json['provider'] != 'google' ||
        json['connectionId'] != expectedConnectionId) {
      throw const FormatException('Mismatched calendar color source');
    }
    final enabled = json['providerColorWrites'] == true;
    final options = <GoogleCalendarColorOption>[];
    if (enabled && json['options'] is List) {
      for (final raw in (json['options'] as List).take(256)) {
        if (raw is! Map) {
          continue;
        }
        final kind = raw['kind'];
        final id = raw['id'];
        final background = raw['background'];
        if (!['inherit', 'event', 'label'].contains(kind) ||
            background is! String ||
            !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(background)) {
          continue;
        }
        if (kind == 'inherit' ? id != null : id is! String || id.isEmpty) {
          continue;
        }
        options.add(
          GoogleCalendarColorOption(
            kind: kind as String,
            id: id as String?,
            background: background,
            name: raw['name'] is String ? raw['name'] as String : null,
          ),
        );
      }
    }
    return GoogleCalendarColorOptions(
      connectionId: expectedConnectionId,
      writesEnabled: enabled,
      options: List.unmodifiable(options),
    );
  }
  final String connectionId;
  final bool writesEnabled;
  final List<GoogleCalendarColorOption> options;
}
