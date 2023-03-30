insert into public.workspace_presets (name)
values ('GENERAL'),
    ('PHARMACY'),
    ('EDUCATION');
-- Populate handles
insert into public.handles (value)
values ('user1'),
    ('user2'),
    ('user3'),
    ('personal'),
    ('prototype-general'),
    ('prototype-pharmacy'),
    ('prototype-school');
-- Populate users
insert into public.users (id, handle, display_name, email)
values (
        '00000000-0000-0000-0000-000000000001',
        'user1',
        'Random User 1',
        'user1@tuturuuu.com'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'user2',
        'Random User 2',
        'user2@tuturuuu.com'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'user3',
        'Random User 3',
        'user3@tuturuuu.com'
    );
-- Populate workspaces
insert into public.workspaces (id, name, handle, preset)
values (
        '00000000-0000-0000-0000-000000000001',
        'Personal',
        'personal',
        'GENERAL'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Prototype General',
        'prototype-general',
        'GENERAL'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Prototype Pharmacy',
        'prototype-pharmacy',
        'PHARMACY'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Prototype School',
        'prototype-school',
        'EDUCATION'
    );
-- Populate workspace_members
insert into public.workspace_members (user_id, ws_id)
values (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002'
    );
-- Populate workspace_teams
insert into public.workspace_teams (id, name, ws_id)
values (
        '00000000-0000-0000-0000-000000000001',
        'Personal',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Lora',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Kora',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Mora',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Sora',
        '00000000-0000-0000-0000-000000000002'
    );
-- Populate documents
insert into public.workspace_documents (name, ws_id)
values (
        'Document 1',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        'Document 2',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        'Document 3',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        'Document 4',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        'Document 5',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        'Document 6',
        '00000000-0000-0000-0000-000000000004'
    );
-- Populate boards
insert into public.workspace_boards (id, name, ws_id)
values (
        '00000000-0000-0000-0000-000000000001',
        'Board 1',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Board 2',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Board 3',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Board 4',
        '00000000-0000-0000-0000-000000000002'
    );
-- Populate wallets
insert into public.workspace_wallets (id, name, ws_id)
values (
        '00000000-0000-0000-0000-000000000001',
        'Wallet 1',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Wallet 2',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Wallet 3',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Wallet 4',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Wallet 5',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Wallet 6',
        '00000000-0000-0000-0000-000000000004'
    );
-- Populate transactions
insert into public.wallet_transactions (name, amount, wallet_id)
values (
        'Transaction 1',
        100000,
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        'Transaction 2',
        200000,
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        'Transaction 3',
        300000,
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        'Transaction 4',
        400000,
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        'Transaction 5',
        500000,
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        'Transaction 6',
        600000,
        '00000000-0000-0000-0000-000000000004'
    );