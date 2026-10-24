import 'package:mobile/core/cache/pending_mutation_record.dart';

String mailSettingsEntityId(String mailboxId) => 'mail-settings:$mailboxId';

/// Persist display data only. Roles and unknown provider fields stay online.
Map<String, dynamic> mailSettingsAccountsSnapshot(
  Map<String, dynamic> source,
) => {
  'mailboxes': [
    for (final box
        in (source['mailboxes'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>())
      if (box['id'] is String && box['address'] is String)
        {'id': box['id'], 'address': box['address']},
  ],
};

Map<String, dynamic> mailSettingsSnapshot(Map<String, dynamic> source) {
  final settings = source['settings'];
  if (settings is! Map<String, dynamic>) {
    throw const FormatException('Missing mail settings');
  }
  final automation = settings['automation'];
  final forwarding = automation is Map<String, dynamic>
      ? automation['forwarding']
      : null;
  final group = settings['groupPolicy'];
  return {
    'settings': {
      for (final key in const [
        'senderName',
        'signatureText',
        'aiInstructions',
        'autoDraftEnabled',
        'outboundProviderOverride',
      ])
        if (settings.containsKey(key)) key: settings[key],
      if (automation is Map<String, dynamic>)
        'automation': {
          'smartLabelsEnabled':
              automation['smartLabelsEnabled'] as bool? ?? false,
          if (forwarding is Map<String, dynamic>)
            'forwarding': {
              'mode': forwarding['mode'],
              if (forwarding['address'] is String)
                'address': forwarding['address'],
            },
        },
      if (settings.containsKey('groupPolicy'))
        'groupPolicy': group is Map<String, dynamic>
            ? {
                'historyEnabled': false,
                for (final key in const ['posting', 'attachments', 'sendAs'])
                  key: group[key],
              }
            : null,
    },
  };
}

Map<String, dynamic> overlayPendingMailSettings({
  required String? userId,
  required String workspaceId,
  required String path,
  required Map<String, dynamic> source,
  required List<PendingMutationRecord> pending,
}) {
  final settings = Map<String, dynamic>.from(
    source['settings'] as Map<String, dynamic>,
  );
  if (userId == null) {
    return {'settings': settings};
  }
  for (final edit in pending) {
    if (edit.userId != userId ||
        edit.workspaceId != workspaceId ||
        edit.feature != 'mail' ||
        edit.method != 'PATCH' ||
        edit.path != path) {
      continue;
    }
    settings.addAll(
      mailSettingsSnapshot({'settings': edit.payload ?? {}})['settings']
          as Map<String, dynamic>,
    );
  }
  return {'settings': settings};
}
