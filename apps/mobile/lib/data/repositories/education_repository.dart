import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class EducationRepository {
  EducationRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<EducationPagedResult<EducationCourse>> getCourses(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _api.getJson(
      EducationEndpoints.courses(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    return EducationPagedResult<EducationCourse>(
      items: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationCourse.fromJson)
          .toList(growable: false),
      count: educationAsInt(response['count']),
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createCourse(
    String wsId, {
    required String name,
    String? description,
  }) async {
    await _api.postJson(EducationEndpoints.courses(wsId), {
      'name': name,
      'description': description,
    });
  }

  Future<void> updateCourse(
    String wsId,
    String courseId, {
    required String name,
    String? description,
  }) async {
    await _api.putJson(EducationEndpoints.course(wsId, courseId), {
      'name': name,
      'description': description,
    });
  }

  Future<void> deleteCourse(String wsId, String courseId) async {
    await _api.deleteJson(EducationEndpoints.course(wsId, courseId));
  }

  Future<EducationPagedResult<EducationQuizSet>> getQuizSets(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _api.getJson(
      EducationEndpoints.quizSets(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    return EducationPagedResult<EducationQuizSet>(
      items: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationQuizSet.fromJson)
          .toList(growable: false),
      count: educationAsInt(response['count']),
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createQuizSet(
    String wsId, {
    required String name,
  }) async {
    await _api.postJson(EducationEndpoints.quizSets(wsId), {'name': name});
  }

  Future<void> updateQuizSet(
    String wsId,
    String setId, {
    required String name,
  }) async {
    await _api.putJson(EducationEndpoints.quizSet(wsId, setId), {'name': name});
  }

  Future<void> deleteQuizSet(String wsId, String setId) async {
    await _api.deleteJson(EducationEndpoints.quizSet(wsId, setId));
  }

  Future<EducationPagedResult<EducationQuiz>> getQuizzes(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _api.getJson(
      EducationEndpoints.quizzes(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    return EducationPagedResult<EducationQuiz>(
      items: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationQuiz.fromJson)
          .toList(growable: false),
      count: educationAsInt(response['count']),
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createQuiz(
    String wsId, {
    required String question,
    required List<Map<String, dynamic>> options,
  }) async {
    await _api.postJson(EducationEndpoints.quizzes(wsId), {
      'quizzes': [
        {
          'question': question,
          'quiz_options': options,
        },
      ],
    });
  }

  Future<void> updateQuiz(
    String wsId,
    String quizId, {
    required String question,
    required List<Map<String, dynamic>> options,
  }) async {
    await _api.putJson(EducationEndpoints.quiz(wsId, quizId), {
      'question': question,
      'quiz_options': options,
    });
  }

  Future<void> deleteQuiz(String wsId, String quizId) async {
    await _api.deleteJson(EducationEndpoints.quiz(wsId, quizId));
  }

  Future<EducationPagedResult<EducationFlashcard>> getFlashcards(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _api.getJson(
      EducationEndpoints.flashcards(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    return EducationPagedResult<EducationFlashcard>(
      items: (response['data'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(EducationFlashcard.fromJson)
          .toList(growable: false),
      count: educationAsInt(response['count']),
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createFlashcard(
    String wsId, {
    required String front,
    required String back,
  }) async {
    await _api.postJson(EducationEndpoints.flashcards(wsId), {
      'front': front,
      'back': back,
    });
  }

  Future<void> updateFlashcard(
    String wsId,
    String flashcardId, {
    required String front,
    required String back,
  }) async {
    await _api.putJson(EducationEndpoints.flashcard(wsId, flashcardId), {
      'front': front,
      'back': back,
    });
  }

  Future<void> deleteFlashcard(String wsId, String flashcardId) async {
    await _api.deleteJson(EducationEndpoints.flashcard(wsId, flashcardId));
  }

  Future<EducationAttemptListResult> getAttempts(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
    String? setId,
    String sortBy = 'newest',
    String sortDirection = 'desc',
  }) async {
    final response = await _api.getJson(
      EducationEndpoints.attempts(
        wsId,
        page: page,
        pageSize: pageSize,
        status: status,
        setId: setId,
        sortBy: sortBy,
        sortDirection: sortDirection,
      ),
    );
    return EducationAttemptListResult.fromJson(response);
  }

  Future<EducationAttemptDetail> getAttemptDetail(
    String wsId,
    String attemptId,
  ) async {
    final response = await _api.getJson(
      EducationEndpoints.attempt(wsId, attemptId),
    );
    return EducationAttemptDetail.fromJson(response);
  }

  void dispose() {
    _api.dispose();
  }
}
