import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/repositories/finance_analytics_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _AuthClient extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

const _ws = '11111111-1111-4111-8111-111111111111';

// Response shapes follow the Finance chart route handlers in
// apps/finance/src/app/api/workspaces/[wsId]/finance/charts.
void main() {
  late List<http.Request> requests;
  late FinanceAnalyticsRepository repository;
  late Map<String, Object?> Function(Uri url) respond;

  setUp(() {
    requests = [];
    final authClient = _AuthClient();
    final auth = _Auth();
    final session = _Session();
    when(() => authClient.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(
      const User(
        id: 'synthetic-analytics-user',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      ),
    );
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-analytics-token');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    repository = FinanceAnalyticsRepository(
      apiClient: ApiClient(
        baseUrl: 'https://finance.example.test',
        authClient: authClient,
        httpClient: MockClient((request) async {
          requests.add(request);
          return http.Response(
            jsonEncode(respond(request.url)),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      ),
    );
  });

  test('requests the income and expense summary with every required '
      'query parameter and parses the route shape', () async {
    respond = (_) => {
      'average_expense': 25,
      'average_income': 100,
      'closing_balance': 200,
      'data': [
        {'period': '2026-11-02', 'total_expense': -25, 'total_income': 100},
      ],
      'net_total': 75,
      'opening_balance': 125,
      'total_expense': 25,
      'total_income': 100,
    };

    final summary = await repository.incomeExpense(
      _ws,
      start: DateTime(2026, 11),
      last: DateTime(2026, 11, 30),
      monthly: false,
    );

    final url = requests.single.url;
    expect(url.path, FinanceAnalyticsEndpoints.incomeExpense(_ws));
    expect(url.queryParameters, {
      'startDate': '2026-11-01',
      'endDate': '2026-11-30',
      'interval': 'daily',
      'includeConfidential': 'true',
    });
    expect(summary.closingBalance, 200);
    expect(summary.openingBalance, 125);
    expect(summary.points.single.date, DateTime(2026, 11, 2));
    expect(summary.points.single.expense, 25);
  });

  test('requests the balance trend with includeConfidential', () async {
    respond = (_) => {
      'data': [
        {'date': '2026-11-01', 'balance': 125000},
        {'date': '2026-11-02', 'balance': 130000.5},
      ],
    };

    final trend = await repository.balanceTrend(
      _ws,
      start: DateTime(2026, 11),
      last: DateTime(2026, 11, 30),
    );

    expect(requests.single.url.queryParameters, {
      'startDate': '2026-11-01',
      'endDate': '2026-11-30',
      'maxPoints': '62',
      'includeConfidential': 'true',
    });
    expect(trend.map((point) => point.balance), [125000, 130000.5]);
    expect(trend.first.date, DateTime(2026, 11));
  });
}
