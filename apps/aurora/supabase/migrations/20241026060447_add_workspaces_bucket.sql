INSERT INTO
    storage.buckets (id, name, public, avif_autodetection)
SELECT
    'workspaces',
    'workspaces',
    false,
    true
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            storage.buckets
        WHERE
            name = 'workspaces'
    );