# Portable legacy recovery characterization

These four tests intentionally assert the defects in PR5705 head
`f2270b7d69009b46058505edaffa82cff28c06c4`. They passed at that exact source head.
They are **not acceptance tests** and must not be run as a green gate against the
recovery fix. The fourth characterizes resubmission after controller success;
the corrected mounted preference/cache flows are separately covered below.
All identities, products, prices and responses are synthetic. No transport makes
an HTTP request.

## Preconditions and bounded execution

Use a separate isolated checkout at the legacy SHA above. Verify `git rev-parse
HEAD` before creating the temporary test. Read root/mobile AGENTS and active
coordination notes. Do not switch a shared checkout or alter another task's files.
No install, app build, database or live sales request is needed. Tests require an
already installed Flutter toolchain and compatible existing dependencies. If these
are unavailable, stop with that concrete dependency blocker rather than installing.

For a fresh checkout, an already configured donor is usable only if both
`apps/mobile/pubspec.yaml` and `pubspec.lock` are byte-identical. Copy only the
read-only dependency metadata into the isolated checkout: resolve every package's
rootUri against the donor `.dart_tool/package_config.json` directory to an absolute
URI, then rebind only package `mobile` to the new checkout's `apps/mobile/` URI.
Copy `package_graph.json` unchanged. Write only the new checkout metadata; preserve
the donor and verify its original hashes afterward. Do not copy build caches or
run pub get. This is the dependency method used for the recorded local run.

Save the complete code below as an intentionally untracked
`apps/mobile/test/legacy_recovery_characterization_test.dart` in that isolated
legacy checkout. Run just that file through the shared resource FIFO:

```sh
ttr resources status --json
UV_CACHE_DIR=/tmp/inventory-recovery-uv-cache ttr resources run -- uv run --no-project --offline --no-managed-python python - <<'PY_RUN'
import os, signal, subprocess, sys, tempfile
legacy = 'f2270b7d69009b46058505edaffa82cff28c06c4'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == legacy
with tempfile.TemporaryFile(mode='w+t') as log:
    process = subprocess.Popen(
        ['flutter', 'test', '--no-pub', '--concurrency=1',
         'test/legacy_recovery_characterization_test.dart'],
        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    try:
        code = process.wait(timeout=180)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        code = 124
    log.seek(0)
    output = log.read()
print(output)
if code == 0 and 'All tests passed!' not in output:
    code = 125
sys.exit(code)
PY_RUN
```

Run from `apps/mobile`. Use the installed Flutter executable on the current host,
not a hard-coded executor path. Wrap the admitted test in a 180-second subprocess
process-group deadline; SIGTERM and then SIGKILL only that owned group if it
expires. Do not kill a different FIFO owner. Require exit 0 **and** the actual
`All tests passed!` completion marker. The original result was 4 characterizations,
exit 0, through shared FIFO. An incomplete or interrupted exit 0 is not proof.

## Complete sanitized test source

```dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_sales_period.dart';
import 'package:mobile/data/models/inventory/inventory_season_price.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';

Map<String, dynamic> priceRow({
  String id = 'quote-1',
  String currency = 'USD',
  String from = '2026-10-01T00:00:00Z',
  String? to,
  double price = 12.5,
}) => {
  'id': id,
  'period_id': 'season',
  'product_id': 'product',
  'unit_id': 'unit',
  'warehouse_id': 'warehouse',
  'currency': currency,
  'price': price,
  'valid_from': from,
  'valid_to': to,
};
InventorySeasonQuote quote({
  List<Map<String, dynamic>>? rows,
  String asOf = '2026-10-01T01:00:00Z',
}) => InventorySeasonQuote.fromJson({
  'as_of': asOf,
  'data': rows ?? [priceRow()],
});
InventorySalesPeriod period({
  String scope = 'all',
  List<String> ids = const [],
  String zone = 'America/Los_Angeles',
  String date = '2026-09-30',
}) => InventorySalesPeriod(
  id: 'season',
  name: 'Season',
  status: 'active',
  saleCount: 0,
  pricingMode: 'scheduled',
  timeZone: zone,
  startsAt: DateTime.parse(date),
  endsAt: DateTime.parse(date),
  productScope: scope,
  productIds: ids,
);
const List<Map<String, dynamic>> lines = [
  {
    'product_id': 'product',
    'unit_id': 'unit',
    'warehouse_id': 'warehouse',
    'quantity': 2,
    'price': 999999,
  },
];

void main() {
  InventorySeasonPricingController make(Future<String> Function(String, Map<String,dynamic>) send) => InventorySeasonPricingController(fetch: (_,__) async => quote(),send:send,isOnline:() async=>true,now:()=>DateTime.utc(2026,10),requestId:()=>DateTime.now().microsecondsSinceEpoch.toString())..configure(actorId:'a',workspaceId:'w',selectedPeriod:period(),currency:'USD');
  Future<String> submit(InventorySeasonPricingController c)=>c.submit(walletId:'wallet',categoryId:'category',products:lines,content:'Sale');
  test('DEFECT scope switch destroys uncertain operation and returning actor has no pending',() async {
    final c=make((_,__) async=>throw const ApiException(message:'lost',statusCode:0));
    await c.refresh(); await expectLater(submit(c),throwsA(isA<ApiException>())); expect(c.hasPending,isTrue);
    c.configure(actorId:'b',workspaceId:'w',selectedPeriod:period(),currency:'USD'); expect(c.hasPending,isFalse);
    c.configure(actorId:'a',workspaceId:'w',selectedPeriod:period(),currency:'USD'); expect(c.hasPending,isFalse); c.dispose();
  });
  test('DEFECT restart creates controller with no uncertain operation',() async {
    final c=make((_,__) async=>throw const ApiException(message:'lost',statusCode:0)); await c.refresh(); await expectLater(submit(c),throwsA(isA<ApiException>())); expect(c.hasPending,isTrue); c.dispose();
    final restored=make((_,__) async=>'invoice'); expect(restored.hasPending,isFalse); restored.dispose();
  });
  test('DEFECT rejection on retry destroys original uncertain key',() async {
    for(final code in [400,401,403,409,422,503]) {
      var attempt=0; final c=make((_,__) async=>throw ApiException(message:'failure',statusCode:attempt++==0?0:code)); await c.refresh(); await expectLater(submit(c),throwsA(isA<ApiException>())); expect(c.hasPending,isTrue); await expectLater(submit(c),throwsA(isA<ApiException>())); expect(c.hasPending,isFalse,reason:'retry status $code'); c.dispose();
    }
  });
  test('DEFECT confirmed success leaves controller ready for new key on same cart',() async {
    final keys=<String>[]; final c=make((_,p) async {keys.add(p['inventory_request_id'] as String);return 'invoice';}); await c.refresh(); await submit(c); expect(c.hasPending,isFalse); expect(c.ready,isTrue); await Future<void>.delayed(const Duration(milliseconds:1)); await submit(c); expect(keys.length,2); expect(keys[0],isNot(keys[1])); c.dispose();
  });
}
```

## Corrected-source acceptance

At recovery head `25db5cf63ecbad9b9cb6062a76816ffbe8bbf8fa`, use the versioned
`apps/mobile/test/features/inventory/season_pricing/` and existing checkout
partial-options test. Run with `flutter test --no-pub --concurrency=1` through the
same bounded FIFO. The recorded run contains 40 unique passing mobile tests and
scoped fatal-info Dart analysis reports No issues found. The new receipt route
has 7 passing Vitest tests with one worker and no file parallelism; Biome is clean.

The checked-in narrow Node runner removes executor-specific Vitest configuration.
From the repository root, with already installed compatible dependencies:

```sh
ttr resources run -- node_modules/.bin/vitest run --config apps/inventory/vitest.sale-recovery.config.mts
```

It uses current workspace source aliases, one worker and no file parallelism.
Apply the same owned-process hard deadline as above (45 seconds suffices for this
seven-test suite), and require the actual seven-passed summary plus exit 0. Do not
install dependencies or run an app build just to reproduce this proof.

The persistent fake survives controller recreation and scope changes, while the
secure-storage adapter round trip uses the existing plugin's test mock. Mounted
flows cover success followed by preference/cache failure, frozen recovery after
metadata denial, and removal of incompatible metadata Retry. Neither mock proves
native keychain/keystore persistence or deployed API availability. Full mounted
320/768px recovery captures at 1.5x text are in this directory.

## Ownership, contract and release blockers

Mobile journal: `apps/mobile/lib/data/sources/inventory_sale_journal.dart`, key
`inventory_sale_v1:<escaped actor>:<escaped workspace>`, version 1, immutable JSON
body/key plus frozen currency, provenance and display labels. It is separate from
cache eviction, auth tokens and automatic offline replay. Durably prepare and
verify before POST; only a matching confirmed invoice may be acknowledged.

Read-only receipt GET is owned by
`apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/sale-requests/[requestId]`.
It derives actor identity from canonical workspace authentication, requires current
create-sales permission and selects only matching actor/workspace/request receipt
from existing `private.inventory_sale_price_snapshots`. No new schema or finance
POST transaction changes. Response is no-store state/request_id/invoice_id only.
`not_observed`, all errors and every rejection retain uncertainty. An explicit
recovery action may resend only the original key/body after lookup; there is no
background or blind replay, new key, revised payload or unsafe journal reset.

Keep PR #5705 blocked for reviewed follow-up integration and exact-head mobile/API
CI including type-check/build, native OS persistence acceptance, receipt endpoint
availability and existing pricing migration verification. Requests that remain
uncommitted and rejected require manual reconciliation; this follow-up does not
add terminal cancellation/rejection or cross-device business-draft deduplication.
