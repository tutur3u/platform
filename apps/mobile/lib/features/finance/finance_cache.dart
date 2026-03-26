const financeCacheTtl = Duration(minutes: 2);

bool isFinanceCacheFresh(DateTime fetchedAt) {
  return DateTime.now().difference(fetchedAt) < financeCacheTtl;
}
