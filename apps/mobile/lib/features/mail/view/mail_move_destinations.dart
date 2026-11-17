/// Where the reader's Move action can send the open message.
///
/// System destinations reuse the existing archive, trash and restore commands;
/// custom ones are the mailbox's own folders the owning view already loaded.
class MailMoveDestination {
  const MailMoveDestination.inbox() : this._('restore', null, null);
  const MailMoveDestination.archive() : this._('archive', null, null);
  const MailMoveDestination.trash() : this._('trash', null, null);
  const MailMoveDestination.custom({
    required String this.folderId,
    required String this.name,
  }) : action = 'move_to_folder';
  const MailMoveDestination._(this.action, this.folderId, this.name);

  /// The mutation sent for this destination.
  final String action;

  /// Set only for custom folders.
  final String? folderId;
  final String? name;

  bool get isCustom => folderId != null;
}

/// Destinations for a message opened from [sourceFolder], never listing the
/// folder the message is already in. Only well-formed custom folders appear.
List<MailMoveDestination> mailMoveDestinations({
  required String? sourceFolder,
  required List<Map<String, dynamic>> folders,
}) => [
  if (sourceFolder != 'inbox') const MailMoveDestination.inbox(),
  if (sourceFolder != 'archive') const MailMoveDestination.archive(),
  if (sourceFolder != 'trash') const MailMoveDestination.trash(),
  for (final folder in folders)
    if (folder['kind'] == 'custom' &&
        folder['id'] is String &&
        (folder['id'] as String).isNotEmpty &&
        folder['name'] is String &&
        (folder['name'] as String).trim().isNotEmpty &&
        sourceFolder != folder['id'] &&
        sourceFolder != 'folder:${folder['id']}')
      MailMoveDestination.custom(
        folderId: folder['id'] as String,
        name: (folder['name'] as String).trim(),
      ),
];
