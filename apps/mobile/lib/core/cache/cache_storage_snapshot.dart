/// Logical cached payload sizes. Encrypted Hive metadata and file overhead are
/// excluded; these numbers are suitable for comparing categories and limits.
class CacheStorageSnapshot {
  const CacheStorageSnapshot({
    required this.totalBytes,
    required this.maxBytes,
    required this.categoryBytes,
  });

  final int totalBytes;
  final int maxBytes;
  final Map<CacheStorageCategory, int> categoryBytes;
}

enum CacheStorageCategory {
  mailMedia,
  mail,
  messages,
  tasks,
  calendar,
  finance,
  other;

  static CacheStorageCategory forNamespace(String namespace) {
    if (namespace.startsWith('mail.media.')) return mailMedia;
    if (namespace.startsWith('mail.')) return mail;
    if (namespace.startsWith('assistant.') ||
        namespace.startsWith('chat.') ||
        namespace.startsWith('notes.')) {
      return messages;
    }
    if (namespace.startsWith('tasks.')) return tasks;
    if (namespace.startsWith('calendar.')) return calendar;
    if (namespace.startsWith('finance.')) return finance;
    return other;
  }
}
