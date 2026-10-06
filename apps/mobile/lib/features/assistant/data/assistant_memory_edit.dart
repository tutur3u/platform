/// Canonical content and opaque server revision, never inferred from list text.
class EditableAssistantMemory {
  const EditableAssistantMemory({
    required this.id,
    required this.content,
    required this.revision,
  });
  factory EditableAssistantMemory.fromJson(
    Map<String, dynamic> json, {
    required String expectedId,
  }) {
    final id = json['id'];
    final content = json['content'];
    final revision = json['revision'];
    if (id != expectedId ||
        content is! String ||
        revision is! String ||
        !RegExp(r'^v1:[a-f0-9]{32}$').hasMatch(revision)) {
      throw const FormatException('Memory revision not confirmed');
    }
    return EditableAssistantMemory(
      id: expectedId,
      content: content,
      revision: revision,
    );
  }
  final String id;
  final String content;
  final String revision;
}

class AssistantMemoryEditReceipt {
  const AssistantMemoryEditReceipt({
    required this.memory,
    required this.auditRecorded,
  });
  factory AssistantMemoryEditReceipt.fromJson(
    Map<String, dynamic> json, {
    required String expectedId,
    required String previousRevision,
    required String submittedText,
  }) {
    if (json['updated'] != true ||
        json['memory'] is! Map<String, dynamic> ||
        json['auditRecorded'] is! bool ||
        (json['auditRecorded'] == true
            ? json['warning'] != null
            : json['warning'] != 'audit_failed')) {
      throw const FormatException('Memory edit not confirmed');
    }
    final memory = EditableAssistantMemory.fromJson(
      json['memory'] as Map<String, dynamic>,
      expectedId: expectedId,
    );
    if (memory.revision == previousRevision ||
        memory.content != submittedText.trim()) {
      throw const FormatException('Memory edit not confirmed');
    }
    return AssistantMemoryEditReceipt(
      memory: memory,
      auditRecorded: json['auditRecorded'] as bool,
    );
  }
  final EditableAssistantMemory memory;
  final bool auditRecorded;
}
