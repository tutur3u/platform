import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class EducationRepository {
  EducationRepository({ApiClient? apiClient, this.expectedUserId})
    : _api = apiClient ?? ApiClient(expectedUserId: expectedUserId);
  final String? expectedUserId;

  final ApiClient _api;

  Future<Map<String, dynamic>> _read(
    String wsId,
    String collection,
    String path,
  ) => readThroughJson(
    api: _api,
    namespace: 'education.$collection',
    workspaceId: wsId,
    path: path,
    cacheUserId: expectedUserId == null ? null : () => expectedUserId,
  );

  Future<List<Map<String, dynamic>>> _rows(
    String wsId,
    String segment,
    Map<String, dynamic> response, {
    String query = '',
    int page = 1,
    String? textField,
    Map<String, dynamic> Function(Map<String, dynamic>)? normalizeCreate,
  }) async {
    final source = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final allPending = await OfflineMutationQueue.instance.listPending();
    if (expectedUserId != null) _api.checkUser(expectedUserId!);
    final pending = allPending
        .where(
          (mutation) =>
              expectedUserId == null || mutation.userId == expectedUserId,
        )
        .toList(growable: false);
    return overlayPendingCollection(
      workspaceId: wsId,
      feature: 'education',
      pathContains: '/$segment',
      source: source,
      pending: pending,
      normalizeCreate: normalizeCreate,
      includeCreates: page == 1,
      matchesQuery: query.trim().isEmpty || textField == null
          ? null
          : (row) => (row[textField] as String? ?? '').toLowerCase().contains(
              query.trim().toLowerCase(),
            ),
    );
  }

  Future<void> _write(
    String wsId,
    String method,
    String path, {
    Map<String, dynamic>? payload,
    String? entityId,
  }) async {
    await queueOrSendVoid(
      feature: 'education',
      expectedUserId: expectedUserId,
      method: method,
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: entityId,
      send: () async {
        switch (method) {
          case 'POST':
            await _api.postJson(path, payload);
          case 'PUT':
            await _api.putJson(path, payload ?? {});
          case 'DELETE':
            await _api.deleteJson(path);
        }
      },
    );
    await CacheStore.instance.invalidateTags(
      {'module:education'},
      workspaceId: wsId,
      userId: expectedUserId,
    );
  }

  Future<EducationPagedResult<EducationCourse>> getCourses(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _read(
      wsId,
      'courses',
      EducationEndpoints.courses(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    final rows = await _rows(
      wsId,
      'courses',
      response,
      query: query,
      page: page,
      textField: 'name',
    );
    final sourceCount = (response['data'] as List<dynamic>? ?? const []).length;
    return EducationPagedResult<EducationCourse>(
      items: rows.map(EducationCourse.fromJson).toList(growable: false),
      count: educationAsInt(response['count']) + rows.length - sourceCount,
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createCourse(
    String wsId, {
    required String name,
    String? description,
  }) async {
    await _write(
      wsId,
      'POST',
      EducationEndpoints.courses(wsId),
      payload: {'name': name, 'description': description},
    );
  }

  Future<void> updateCourse(
    String wsId,
    String courseId, {
    required String name,
    String? description,
  }) async {
    await _write(
      wsId,
      'PUT',
      EducationEndpoints.course(wsId, courseId),
      entityId: courseId,
      payload: {'name': name, 'description': description},
    );
  }

  Future<void> deleteCourse(String wsId, String courseId) async {
    await _write(
      wsId,
      'DELETE',
      EducationEndpoints.course(wsId, courseId),
      entityId: courseId,
    );
  }

  Future<EducationPagedResult<EducationQuizSet>> getQuizSets(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _read(
      wsId,
      'quizSets',
      EducationEndpoints.quizSets(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    final rows = await _rows(
      wsId,
      'quiz-sets',
      response,
      query: query,
      page: page,
      textField: 'name',
    );
    final sourceCount = (response['data'] as List<dynamic>? ?? const []).length;
    return EducationPagedResult<EducationQuizSet>(
      items: rows.map(EducationQuizSet.fromJson).toList(growable: false),
      count: educationAsInt(response['count']) + rows.length - sourceCount,
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createQuizSet(String wsId, {required String name}) async {
    await _write(
      wsId,
      'POST',
      EducationEndpoints.quizSets(wsId),
      payload: {'name': name},
    );
  }

  Future<void> updateQuizSet(
    String wsId,
    String setId, {
    required String name,
  }) async {
    await _write(
      wsId,
      'PUT',
      EducationEndpoints.quizSet(wsId, setId),
      entityId: setId,
      payload: {'name': name},
    );
  }

  Future<void> deleteQuizSet(String wsId, String setId) async {
    await _write(
      wsId,
      'DELETE',
      EducationEndpoints.quizSet(wsId, setId),
      entityId: setId,
    );
  }

  Future<EducationPagedResult<EducationQuiz>> getQuizzes(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _read(
      wsId,
      'quizzes',
      EducationEndpoints.quizzes(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    final rows = await _rows(
      wsId,
      'quizzes',
      response,
      query: query,
      page: page,
      textField: 'question',
      normalizeCreate: (payload) =>
          (payload['quizzes'] as List<dynamic>).first as Map<String, dynamic>,
    );
    final sourceCount = (response['data'] as List<dynamic>? ?? const []).length;
    return EducationPagedResult<EducationQuiz>(
      items: rows.map(EducationQuiz.fromJson).toList(growable: false),
      count: educationAsInt(response['count']) + rows.length - sourceCount,
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createQuiz(
    String wsId, {
    required String question,
    required List<Map<String, dynamic>> options,
  }) async {
    await _write(
      wsId,
      'POST',
      EducationEndpoints.quizzes(wsId),
      payload: {
        'quizzes': [
          {'question': question, 'quiz_options': options},
        ],
      },
    );
  }

  Future<void> updateQuiz(
    String wsId,
    String quizId, {
    required String question,
    required List<Map<String, dynamic>> options,
  }) async {
    await _write(
      wsId,
      'PUT',
      EducationEndpoints.quiz(wsId, quizId),
      entityId: quizId,
      payload: {'question': question, 'quiz_options': options},
    );
  }

  Future<void> deleteQuiz(String wsId, String quizId) async {
    await _write(
      wsId,
      'DELETE',
      EducationEndpoints.quiz(wsId, quizId),
      entityId: quizId,
    );
  }

  Future<EducationPagedResult<EducationFlashcard>> getFlashcards(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _read(
      wsId,
      'flashcards',
      EducationEndpoints.flashcards(
        wsId,
        query: query,
        page: page,
        pageSize: pageSize,
      ),
    );
    final rows = await _rows(
      wsId,
      'flashcards',
      response,
      query: query,
      page: page,
      textField: 'front',
    );
    final sourceCount = (response['data'] as List<dynamic>? ?? const []).length;
    return EducationPagedResult<EducationFlashcard>(
      items: rows.map(EducationFlashcard.fromJson).toList(growable: false),
      count: educationAsInt(response['count']) + rows.length - sourceCount,
      page: educationAsInt(response['page']),
      pageSize: educationAsInt(response['pageSize']),
    );
  }

  Future<void> createFlashcard(
    String wsId, {
    required String front,
    required String back,
  }) async {
    await _write(
      wsId,
      'POST',
      EducationEndpoints.flashcards(wsId),
      payload: {'front': front, 'back': back},
    );
  }

  Future<void> updateFlashcard(
    String wsId,
    String flashcardId, {
    required String front,
    required String back,
  }) async {
    await _write(
      wsId,
      'PUT',
      EducationEndpoints.flashcard(wsId, flashcardId),
      entityId: flashcardId,
      payload: {'front': front, 'back': back},
    );
  }

  Future<void> deleteFlashcard(String wsId, String flashcardId) async {
    await _write(
      wsId,
      'DELETE',
      EducationEndpoints.flashcard(wsId, flashcardId),
      entityId: flashcardId,
    );
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
    final response = await _read(
      wsId,
      'attempts',
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
    final response = await _read(
      wsId,
      'attempt',
      EducationEndpoints.attempt(wsId, attemptId),
    );
    return EducationAttemptDetail.fromJson(response);
  }

  void dispose() {
    _api.dispose();
  }
}
