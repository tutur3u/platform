import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/models/finance/wallet_interest.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('uses the server projection and keeps a paused configuration', () async {
    final api = _Api();
    const path = '/api/workspaces/ws/wallets/wallet/interest';
    when(() => api.getJson(path)).thenAnswer(
      (_) async => {
        'config': {
          'provider': 'zalopay',
          'enabled': false,
          'zalopay_tier': 'gold',
        },
        'currentRate': {'annual_rate': 4.8},
        'projections': {
          'month': [
            {'projectedCumulativeInterest': 5},
            {'projectedCumulativeInterest': 90},
          ],
        },
      },
    );
    final result = await FinanceRepository(
      apiClient: api,
      cacheUserId: () => null,
    ).getWalletInterest('ws', 'wallet');
    expect(result.config?.enabled, isFalse);
    expect(result.config?.tier, WalletInterestTier.gold);
    expect(result.currentRate, 4.8);
    expect(result.projection(WalletInterestProjectionPeriod.month), 90);
    expect(result.projection(WalletInterestProjectionPeriod.week), isNull);
  });

  test('an HTTP error never acknowledges an interest rate change', () async {
    final api = _Api();
    final repository = FinanceRepository(
      apiClient: api,
      cacheUserId: () => 'actor',
    );
    registerFallbackValue(
      ApiMutationAdmission(actorId: 'actor', isCurrent: () => true),
    );
    when(
      () => api.sendJsonStreamAcknowledged(
        'POST',
        '/api/workspaces/ws/wallets/wallet/interest/rates',
        {'annual_rate': 4.5, 'effective_from': '2026-11-20'},
        admission: any(named: 'admission'),
        accept: 'application/json',
      ),
    ).thenAnswer((_) async => http.StreamedResponse(const Stream.empty(), 403));

    await expectLater(
      repository.addWalletInterestRate(
        'ws',
        'wallet',
        percent: 4.5,
        effectiveFrom: '2026-11-20',
        active: () => true,
      ),
      throwsA(
        isA<ApiException>().having((error) => error.statusCode, 'status', 403),
      ),
    );
  });
}
