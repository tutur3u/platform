import 'package:mobile/data/sources/api_exception.dart';

class NotesVoiceJob {
  const NotesVoiceJob({
    required this.id,
    required this.workspaceId,
    required this.status,
    required this.revision,
    this.transcript,
    this.artifact,
    this.errorCode,
  });
  factory NotesVoiceJob.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final workspaceId = json['wsId'];
    final status = json['status'];
    final revision = json['revision'];
    if (id is! String ||
        id.isEmpty ||
        workspaceId is! String ||
        workspaceId.isEmpty ||
        revision is! int ||
        revision < 1 ||
        (json['transcript'] != null && json['transcript'] is! String) ||
        (json['artifact'] != null && json['artifact'] is! Map) ||
        (json['errorCode'] != null && json['errorCode'] is! String) ||
        (status == 'completed' &&
            (json['transcript'] is! String || json['artifact'] is! Map)) ||
        !{
          'pending',
          'transcribing',
          'summarizing',
          'completed',
          'failed',
          'review_required',
        }.contains(status)) {
      throw const ApiException(
        message: 'Invalid voice job response',
        statusCode: 0,
        failureKind: ApiFailureKind.response,
      );
    }
    return NotesVoiceJob(
      id: id,
      workspaceId: workspaceId,
      status: status as String,
      revision: revision,
      transcript: json['transcript'] as String?,
      artifact: (json['artifact'] as Map?)?.cast<String, dynamic>(),
      errorCode: json['errorCode'] as String?,
    );
  }
  final String id;
  final String workspaceId;
  final String status;
  final int revision;
  final String? transcript;
  final Map<String, dynamic>? artifact;
  final String? errorCode;
  bool get processing =>
      {'pending', 'transcribing', 'summarizing'}.contains(status);
  bool get complete => status == 'completed';
  bool get retryable => status == 'failed';
  bool get canReview => complete || canSave;
  bool get canSave =>
      (complete || retryable) && (transcript?.trim().isNotEmpty ?? false);
  Map<String, dynamic> toJson() => {
    'id': id,
    'wsId': workspaceId,
    'status': status,
    'revision': revision,
    'transcript': transcript,
    'artifact': artifact,
    'errorCode': errorCode,
  };
}
