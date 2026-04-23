import 'package:equatable/equatable.dart';

String? educationAsString(Object? value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  return null;
}

int educationAsInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

double educationAsDouble(Object? value) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

bool educationAsBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) return value.toLowerCase() == 'true';
  return false;
}

class EducationCourse extends Equatable {
  const EducationCourse({
    required this.id,
    required this.name,
    this.description,
    this.certTemplate,
    this.createdAt,
    this.modulesCount = 0,
  });

  factory EducationCourse.fromJson(Map<String, dynamic> json) {
    return EducationCourse(
      id: educationAsString(json['id']) ?? '',
      name: educationAsString(json['name']) ?? '',
      description: educationAsString(json['description']),
      certTemplate: educationAsString(json['cert_template']),
      createdAt: educationAsString(json['created_at']),
      modulesCount: educationAsInt(json['modules_count']),
    );
  }

  final String id;
  final String name;
  final String? description;
  final String? certTemplate;
  final String? createdAt;
  final int modulesCount;

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    certTemplate,
    createdAt,
    modulesCount,
  ];
}

class EducationQuizOption extends Equatable {
  const EducationQuizOption({
    required this.id,
    required this.value,
    required this.isCorrect,
    this.explanation,
  });

  factory EducationQuizOption.fromJson(Map<String, dynamic> json) {
    return EducationQuizOption(
      id: educationAsString(json['id']) ?? '',
      value: educationAsString(json['value']) ?? '',
      isCorrect: educationAsBool(json['is_correct']),
      explanation: educationAsString(json['explanation']),
    );
  }

  final String id;
  final String value;
  final bool isCorrect;
  final String? explanation;

  @override
  List<Object?> get props => [id, value, isCorrect, explanation];
}

class EducationQuiz extends Equatable {
  const EducationQuiz({
    required this.id,
    required this.question,
    required this.options,
    this.createdAt,
  });

  factory EducationQuiz.fromJson(Map<String, dynamic> json) {
    return EducationQuiz(
      id: educationAsString(json['id']) ?? '',
      question: educationAsString(json['question']) ?? '',
      createdAt: educationAsString(json['created_at']),
      options: (json['quiz_options'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationQuizOption.fromJson)
          .toList(growable: false),
    );
  }

  final String id;
  final String question;
  final List<EducationQuizOption> options;
  final String? createdAt;

  @override
  List<Object?> get props => [id, question, options, createdAt];
}

class EducationQuizSet extends Equatable {
  const EducationQuizSet({
    required this.id,
    required this.name,
    this.createdAt,
    this.linkedModulesCount = 0,
  });

  factory EducationQuizSet.fromJson(Map<String, dynamic> json) {
    return EducationQuizSet(
      id: educationAsString(json['id']) ?? '',
      name: educationAsString(json['name']) ?? '',
      createdAt: educationAsString(json['created_at']),
      linkedModulesCount: educationAsInt(json['linked_modules_count']),
    );
  }

  final String id;
  final String name;
  final String? createdAt;
  final int linkedModulesCount;

  @override
  List<Object?> get props => [id, name, createdAt, linkedModulesCount];
}

class EducationFlashcard extends Equatable {
  const EducationFlashcard({
    required this.id,
    required this.front,
    required this.back,
    this.createdAt,
  });

  factory EducationFlashcard.fromJson(Map<String, dynamic> json) {
    return EducationFlashcard(
      id: educationAsString(json['id']) ?? '',
      front: educationAsString(json['front']) ?? '',
      back: educationAsString(json['back']) ?? '',
      createdAt: educationAsString(json['created_at']),
    );
  }

  final String id;
  final String front;
  final String back;
  final String? createdAt;

  @override
  List<Object?> get props => [id, front, back, createdAt];
}

class EducationPagedResult<T> extends Equatable {
  const EducationPagedResult({
    required this.items,
    required this.count,
    required this.page,
    required this.pageSize,
  });

  final List<T> items;
  final int count;
  final int page;
  final int pageSize;

  @override
  List<Object?> get props => [items, count, page, pageSize];
}

class EducationAttemptFilterSet extends Equatable {
  const EducationAttemptFilterSet({
    required this.id,
    required this.name,
  });

  factory EducationAttemptFilterSet.fromJson(Map<String, dynamic> json) {
    return EducationAttemptFilterSet(
      id: educationAsString(json['id']) ?? '',
      name: educationAsString(json['name']) ?? '',
    );
  }

  final String id;
  final String name;

  @override
  List<Object?> get props => [id, name];
}

class EducationAttemptSummary extends Equatable {
  const EducationAttemptSummary({
    required this.id,
    required this.attemptNumber,
    required this.totalScore,
    required this.durationSeconds,
    this.startedAt,
    this.submittedAt,
    this.completedAt,
    this.setId,
    this.setName,
    this.userId,
    this.learnerName,
    this.learnerEmail,
  });

  factory EducationAttemptSummary.fromJson(Map<String, dynamic> json) {
    return EducationAttemptSummary(
      id: educationAsString(json['id']) ?? '',
      attemptNumber: educationAsInt(json['attempt_number']),
      totalScore: educationAsDouble(json['total_score']),
      durationSeconds: educationAsInt(json['duration_seconds']),
      startedAt: educationAsString(json['started_at']),
      submittedAt: educationAsString(json['submitted_at']),
      completedAt: educationAsString(json['completed_at']),
      setId: educationAsString(json['set_id']),
      setName: educationAsString(json['set_name']),
      userId: educationAsString(json['user_id']),
      learnerName: educationAsString(json['learner_name']),
      learnerEmail: educationAsString(json['learner_email']),
    );
  }

  final String id;
  final int attemptNumber;
  final double totalScore;
  final int durationSeconds;
  final String? startedAt;
  final String? submittedAt;
  final String? completedAt;
  final String? setId;
  final String? setName;
  final String? userId;
  final String? learnerName;
  final String? learnerEmail;

  bool get completed => completedAt != null && completedAt!.isNotEmpty;

  @override
  List<Object?> get props => [
    id,
    attemptNumber,
    totalScore,
    durationSeconds,
    startedAt,
    submittedAt,
    completedAt,
    setId,
    setName,
    userId,
    learnerName,
    learnerEmail,
  ];
}

class EducationAttemptListResult extends Equatable {
  const EducationAttemptListResult({
    required this.attempts,
    required this.count,
    required this.page,
    required this.pageSize,
    required this.sets,
  });

  factory EducationAttemptListResult.fromJson(Map<String, dynamic> json) {
    final filters =
        json['filters'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    return EducationAttemptListResult(
      attempts: (json['attempts'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationAttemptSummary.fromJson)
          .toList(growable: false),
      count: educationAsInt(json['count']),
      page: educationAsInt(json['page']),
      pageSize: educationAsInt(json['pageSize']),
      sets: (filters['sets'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationAttemptFilterSet.fromJson)
          .toList(growable: false),
    );
  }

  final List<EducationAttemptSummary> attempts;
  final int count;
  final int page;
  final int pageSize;
  final List<EducationAttemptFilterSet> sets;

  @override
  List<Object?> get props => [attempts, count, page, pageSize, sets];
}

class EducationAttemptLearner extends Equatable {
  const EducationAttemptLearner({
    required this.userId,
    this.fullName,
    this.email,
  });

  factory EducationAttemptLearner.fromJson(Map<String, dynamic> json) {
    return EducationAttemptLearner(
      userId: educationAsString(json['user_id']) ?? '',
      fullName: educationAsString(json['full_name']),
      email: educationAsString(json['email']),
    );
  }

  final String userId;
  final String? fullName;
  final String? email;

  @override
  List<Object?> get props => [userId, fullName, email];
}

class EducationAttemptAnswer extends Equatable {
  const EducationAttemptAnswer({
    required this.id,
    required this.quizId,
    required this.isCorrect,
    required this.scoreAwarded,
    required this.options,
    this.question,
    this.selectedOptionId,
    this.selectedOptionValue,
    this.selectedOptionIsCorrect,
  });

  factory EducationAttemptAnswer.fromJson(Map<String, dynamic> json) {
    return EducationAttemptAnswer(
      id: educationAsString(json['id']) ?? '',
      quizId: educationAsString(json['quiz_id']) ?? '',
      question: educationAsString(json['question']),
      selectedOptionId: educationAsString(json['selected_option_id']),
      selectedOptionValue: educationAsString(json['selected_option_value']),
      selectedOptionIsCorrect: json['selected_option_is_correct'] == null
          ? null
          : educationAsBool(json['selected_option_is_correct']),
      isCorrect: educationAsBool(json['is_correct']),
      scoreAwarded: educationAsDouble(json['score_awarded']),
      options: (json['options'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationQuizOption.fromJson)
          .toList(growable: false),
    );
  }

  final String id;
  final String quizId;
  final String? question;
  final String? selectedOptionId;
  final String? selectedOptionValue;
  final bool? selectedOptionIsCorrect;
  final bool isCorrect;
  final double scoreAwarded;
  final List<EducationQuizOption> options;

  @override
  List<Object?> get props => [
    id,
    quizId,
    question,
    selectedOptionId,
    selectedOptionValue,
    selectedOptionIsCorrect,
    isCorrect,
    scoreAwarded,
    options,
  ];
}

class EducationAttemptDetail extends Equatable {
  const EducationAttemptDetail({
    required this.attempt,
    required this.answers,
    this.learner,
  });

  factory EducationAttemptDetail.fromJson(Map<String, dynamic> json) {
    return EducationAttemptDetail(
      attempt: EducationAttemptSummary.fromJson(
        json['attempt'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      learner: json['learner'] is Map<String, dynamic>
          ? EducationAttemptLearner.fromJson(
              json['learner'] as Map<String, dynamic>,
            )
          : null,
      answers: (json['answers'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationAttemptAnswer.fromJson)
          .toList(growable: false),
    );
  }

  final EducationAttemptSummary attempt;
  final EducationAttemptLearner? learner;
  final List<EducationAttemptAnswer> answers;

  @override
  List<Object?> get props => [attempt, learner, answers];
}
