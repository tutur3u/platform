class CrmGroupPost {
  const CrmGroupPost({required this.id, this.title, this.content, this.notes});

  factory CrmGroupPost.fromJson(Map<String, dynamic> json) => CrmGroupPost(
    id: json['id'] as String,
    title: json['title'] as String?,
    content: json['content'] as String?,
    notes: json['notes'] as String?,
  );

  final String id;
  final String? title;
  final String? content;
  final String? notes;
}
