-- Production PostgREST can briefly retain stale private-schema metadata after
-- successful chat migrations. Force a schema refresh so service-role calls via
-- `.schema('private')` see recently-added chat AI settings columns.
notify pgrst, 'reload schema';
