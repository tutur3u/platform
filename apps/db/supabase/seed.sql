-- Populate auth users
INSERT INTO
    "auth"."users" (
        "instance_id",
        "id",
        "aud",
        "role",
        "email",
        "encrypted_password",
        "email_confirmed_at",
        "invited_at",
        "confirmation_token",
        "confirmation_sent_at",
        "recovery_token",
        "recovery_sent_at",
        "email_change_token_new",
        "email_change",
        "email_change_sent_at",
        "last_sign_in_at",
        "raw_app_meta_data",
        "raw_user_meta_data",
        "is_super_admin",
        "created_at",
        "updated_at",
        "phone",
        "phone_confirmed_at",
        "phone_change",
        "phone_change_token",
        "phone_change_sent_at",
        "email_change_token_current",
        "email_change_confirm_status",
        "banned_until",
        "reauthentication_token",
        "reauthentication_sent_at",
        "is_sso_user"
    )
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000001',
        'authenticated',
        'authenticated',
        'local@tuturuuu.com',
        crypt('password123', gen_salt('bf')),
        '2023-02-18 23:31:13.017218+00',
        NULL,
        '',
        '2023-02-18 23:31:12.757017+00',
        '',
        NULL,
        '',
        '',
        NULL,
        '2023-02-18 23:31:13.01781+00',
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NULL,
        '2023-02-18 23:31:12.752281+00',
        '2023-02-18 23:31:13.019418+00',
        NULL,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        'f'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000002',
        'authenticated',
        'authenticated',
        'user1@tuturuuu.com',
        crypt('password123', gen_salt('bf')),
        '2023-02-19 00:01:51.351735+00',
        NULL,
        '',
        '2023-02-19 00:01:51.147035+00',
        '',
        NULL,
        '',
        '',
        NULL,
        '2023-02-19 00:01:51.352369+00',
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NULL,
        '2023-02-19 00:01:51.142802+00',
        '2023-02-19 00:01:51.353896+00',
        NULL,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        'f'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000003',
        'authenticated',
        'authenticated',
        'user2@tuturuuu.com',
        crypt('password123', gen_salt('bf')),
        '2023-02-18 23:36:54.88495+00',
        NULL,
        '',
        '2023-02-18 23:36:54.67958+00',
        '',
        NULL,
        '',
        '',
        NULL,
        '2023-02-18 23:36:54.885592+00',
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NULL,
        '2023-02-18 23:36:54.674532+00',
        '2023-02-18 23:36:54.887312+00',
        NULL,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        'f'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000004',
        'authenticated',
        'authenticated',
        'user3@tuturuuu.com',
        crypt('password123', gen_salt('bf')),
        '2023-02-18 23:36:56.08865+00',
        NULL,
        '',
        '2023-02-18 23:36:55.827566+00',
        '',
        NULL,
        '',
        '',
        NULL,
        '2023-02-18 23:48:04.159175+00',
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NULL,
        '2023-02-18 23:36:55.823901+00',
        '2023-02-18 23:48:04.16081+00',
        NULL,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        'f'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000005',
        'authenticated',
        'authenticated',
        'user4@tuturuuu.com',
        crypt('password123', gen_salt('bf')),
        '2023-02-18 23:30:49.554834+00',
        NULL,
        '',
        '2023-02-18 23:30:49.330541+00',
        '',
        NULL,
        '',
        '',
        NULL,
        '2023-02-18 23:48:24.578005+00',
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NULL,
        '2023-02-18 23:30:49.322994+00',
        '2023-02-18 23:48:24.579303+00',
        NULL,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        'f'
    );

-- Populate handles
insert into
    public.handles (value)
values
    ('local'),
    ('user1'),
    ('user2'),
    ('user3'),
    ('user4'),
    ('tuturuuu'),
    ('prototype-all'),
    ('prototype-general'),
    ('prototype-pharmacy'),
    ('prototype-school');

-- Update user handles
update
    public.users
set
    handle = 'local'
where
    id = '00000000-0000-0000-0000-000000000001';

update
    public.users
set
    handle = 'user1'
where
    id = '00000000-0000-0000-0000-000000000002';

update
    public.users
set
    handle = 'user2'
where
    id = '00000000-0000-0000-0000-000000000003';

update
    public.users
set
    handle = 'user3'
where
    id = '00000000-0000-0000-0000-000000000004';

update
    public.users
set
    handle = 'user4'
where
    id = '00000000-0000-0000-0000-000000000005';

-- Update user display names
update
    public.users
set
    display_name = 'Local'
where
    id = '00000000-0000-0000-0000-000000000001';

update
    public.users
set
    display_name = 'User 1'
where
    id = '00000000-0000-0000-0000-000000000002';

update
    public.users
set
    display_name = 'User 2'
where
    id = '00000000-0000-0000-0000-000000000003';

update
    public.users
set
    display_name = 'User 3'
where
    id = '00000000-0000-0000-0000-000000000004';

update
    public.users
set
    display_name = 'User 4'
where
    id = '00000000-0000-0000-0000-000000000005';

-- Populate workspaces
insert into
    public.workspaces (id, name, handle, creator_id)
values
    (
        '00000000-0000-0000-0000-000000000000',
        'Tuturuuu',
        'tuturuuu',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        'Prototype All',
        'prototype-all',
        null
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Prototype General',
        'prototype-general',
        null
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Prototype Pharmacy',
        'prototype-pharmacy',
        null
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Prototype School',
        'prototype-school',
        null
    );

-- Populate workspace_secrets
insert into
    public.workspace_secrets (ws_id, name, value)
values
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_CHAT',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_EDUCATION',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_AI',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_TASKS',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_PROJECTS',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_DOCS',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_DRIVE',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        'ENABLE_FINANCE',
        'true'
    );

-- Populate workspace_members
insert into
    public.workspace_members (user_id, ws_id, role)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'OWNER'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'ADMIN'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'MEMBER'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000000',
        'OWNER'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'OWNER'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        'MEMBER'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        'OWNER'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        'OWNER'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004',
        'ADMIN'
    );

-- Populate workspace_invites with remaining users
insert into
    public.workspace_invites (user_id, ws_id, role, role_title)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'MEMBER',
        'Default Local Account'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        'ADMIN',
        'DLA'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'OWNER',
        'DLA'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000004',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000000',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000001',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000002',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000003',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000004',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        'MEMBER',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000004',
        'MEMBER',
        ''
    );

-- Populate workspace_teams
insert into
    public.workspace_teams (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Alpha',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Beta',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Lora',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Kora',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Mora',
        '00000000-0000-0000-0000-000000000002'
    );

-- Populate documents
insert into
    public.workspace_documents (name, ws_id)
values
    (
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
insert into
    public.workspace_boards (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Board 1',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Board 2',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Board 3',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Board 4',
        '00000000-0000-0000-0000-000000000004'
    );

-- Populate wallets
insert into
    public.workspace_wallets (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Wallet 1',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Wallet 2',
        '00000000-0000-0000-0000-000000000001'
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
insert into
    public.wallet_transactions (description, amount, wallet_id)
values
    (
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

-- Populate inventory product categories
insert into
    public.product_categories (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Thuốc',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Dụng cụ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Vật tư',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Đồ ăn',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Đồ uống',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Đồ chơi',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate inventory units
insert into
    public.inventory_units (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Vỉ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Viên',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Hũ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Hộp',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Lọ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Thùng',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        'Cái',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        'Chiếc',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        'Cây',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000010',
        'Bịch',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000011',
        'Chai',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000012',
        'Lon',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000013',
        'Bao',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000014',
        'Gói',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000015',
        'Bình',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000016',
        'Bộ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000017',
        'Ống',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate workspace products
insert into
    public.workspace_products (id, name, manufacturer, category_id, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Thuốc trị đau',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Thuốc trị viêm',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Thuốc trị bệnh',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Thuốc hạ sốt',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Thuốc trị viêm họng',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        '7-up',
        'Coca-Cola',
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        'Pepsi',
        'PepsiCo',
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        'Lego',
        'Lego Group',
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        'Bánh kẹo',
        'ABC, Inc.',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000010',
        'Bánh mì',
        'Tous les Jours',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate inventory suppliers
insert into
    public.inventory_suppliers (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Nhà thuốc Long Châu',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Nhà thuốc An Khang',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Chợ thuốc',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate inventory warehouses
insert into
    public.inventory_warehouses (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Kho nhà thuốc',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Kho phụ',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate inventory products
insert into
    public.inventory_products (
        product_id,
        unit_id,
        warehouse_id,
        price,
        min_amount
    )
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        3800,
        80
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        22000,
        60
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        92000,
        40
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000001',
        120000,
        20
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000002',
        4000,
        100
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        23000,
        75
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        95000,
        50
    );

-- Populate inventory batches
insert into
    public.inventory_batches (
        id,
        warehouse_id,
        supplier_id,
        price,
        total_diff
    )
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        3000000,
        50000
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        5000000,
        0
    );

-- Populate inventory batch products
insert into
    public.inventory_batch_products (
        batch_id,
        product_id,
        unit_id,
        amount,
        price
    )
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        10000,
        2999000
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        200,
        6000000
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000004',
        50,
        3500000
    );

-- Populate transaction categories
insert into
    public.transaction_categories (id, name, is_expense, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Nhập hàng',
        true,
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Bán hàng',
        false,
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate vitals
insert into
    public.healthcare_vitals (id, ws_id, name, unit)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'Nhiệt độ',
        '°C'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'Chiều cao',
        'cm'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        'Cân nặng',
        'kg'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000003',
        'Huyết áp',
        'mmHg'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000003',
        'Nhịp tim',
        'lần/phút'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000003',
        'Nhịp thở',
        'lần/phút'
    );

-- Populate diagnoses
insert into
    public.healthcare_diagnoses (id, ws_id, name, description)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'Sốt',
        'Sốt là tình trạng nhiệt độ cơ thể cao hơn 37,5°C.'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'Đau bụng',
        'Đau bụng là tình trạng đau ở vùng bụng.'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        'Đau đầu',
        'Đau đầu là tình trạng đau ở vùng đầu.'
    );

-- Populate vital_groups
insert into
    public.healthcare_vital_groups (id, ws_id, name, description)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'Sức khỏe',
        'Nhóm các chỉ số sức khỏe của bệnh nhân.'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        'Tình trạng',
        'Nhóm các chỉ số tình trạng của bệnh nhân.'
    );

-- Populate vital_group_vitals
insert into
    public.vital_group_vitals (group_id, vital_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000005'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000006'
    );

-- Populate workspace_users
insert into
    public.workspace_users (
        full_name,
        email,
        phone,
        birthday,
        gender,
        ethnicity,
        guardian,
        address,
        national_id,
        ws_id
    )
values
    (
        'Nguyen Van A',
        'nguyenvana@gmail.com',
        '0909090808',
        '1997-02-03',
        'MALE',
        'Kinh',
        'VHP',
        'VHP Address',
        '123456789',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        'Nguyen Van B',
        'nguyenvanb@gmail.com',
        '0909090808',
        '2001-06-02',
        'FEMALE',
        'Kinh',
        NULL,
        'q. Tân Bình, tp. Hồ Chí Minh',
        NULL,
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        'Nguyễn Văn C',
        'nguyenvanc@gmail.com',
        '0912345678',
        '1992-03-29',
        'MALE',
        'Kinh',
        NULL,
        NULL,
        NULL,
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate workspace user roles
insert into
    public.workspace_user_groups (id, name, ws_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Bệnh nhân',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Bác sĩ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Y tá',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Kế toán',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Dược sĩ',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Bảo vệ',
        '00000000-0000-0000-0000-000000000003'
    );

-- insert manage_workspace_roles as permission into workspace_default_permissions for all workspaces
insert into
    public.workspace_default_permissions (ws_id, permission, enabled)
values
    (
        '00000000-0000-0000-0000-000000000000',
        'manage_workspace_roles',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        'manage_workspace_roles',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'manage_workspace_roles',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'manage_workspace_roles',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'manage_workspace_roles',
        true
    );

insert into
    public.workspace_courses (id, ws_id, name)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'Course 1'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'Course 2'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'Course 3'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000000',
        'Course 4'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000000',
        'Course 5'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000000',
        'Course 6'
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000000',
        'Course 7'
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000000',
        'Course 8'
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        '00000000-0000-0000-0000-000000000000',
        'Course 9'
    ),
    (
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000000',
        'Course 10'
    );

insert into
    public.workspace_course_modules (course_id, name)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Module 1'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        'Module 2'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Module 3'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Module 4'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Module 5'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Module 6'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Module 7'
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        'Module 8'
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        'Module 9'
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        'Module 10'
    );

insert into
    public.ai_whitelisted_emails (email, enabled)
values
    ('local@tuturuuu.com', true);

insert into
    public.platform_email_roles (email, enabled, allow_challenge_management, allow_role_management, allow_manage_all_challenges)
values
    ('local@tuturuuu.com', true, true, true, true),
    ('user1@tuturuuu.com', true, false, false, false),
    ('user2@tuturuuu.com', true, false, false, false),
    ('user3@tuturuuu.com', true, false, false, false),
    ('user4@tuturuuu.com', true, false, false, false);

insert into
    public.nova_teams (id, name, description, goals)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Team 1',
        'First nova team',
        'First nova team goal'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Team 2',
        'Second nova team',
        'Second nova team goal'
    );

-- Populate nova_team_members
insert into
    public.nova_team_members (team_id, user_id)
values
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000005'
    );

-- Populate nova_challenges
insert into
    public.nova_challenges (id, title, description, duration, enabled, previewable_at, open_at, close_at, max_attempts, max_daily_attempts)
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Challenge 1',
        'Challenge Description 1',
        1800,
        true,
        now(),
        now(),
        now() + interval '7 days',
        10,
        10
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Challenge 2',
        'Challenge Description 2',
        3600,
        true,
        now(),
        now(),
        now() + interval '7 days',
        10,
        10
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Challenge 3',
        'Challenge Description 3',
        5400,
        true,
        now(),
        now(),
        now() + interval '7 days',
        10,
        10
    );

-- Populate nova_challenge_criteria (4 criteria per challenge)
insert into
    public.nova_challenge_criteria (id, name, description, challenge_id)
values
    -- Challenge 1 Criteria
    (
        '00000000-0000-0000-0000-000000000101',
        'Clarity',
        'The prompt should be clear and easy to understand, with explicit instructions.',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        'Specificity',
        'The prompt should be specific and detailed about what is being asked.',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        'Proper Formatting',
        'The prompt should be properly formatted with correct grammar and punctuation.',
        '00000000-0000-0000-0000-000000000001'
    ),
    (
        '00000000-0000-0000-0000-000000000104',
        'Relevance',
        'The prompt should be relevant to the problem domain (fruits and colors).',
        '00000000-0000-0000-0000-000000000001'
    ),
    
    -- Challenge 2 Criteria
    (
        '00000000-0000-0000-0000-000000000201',
        'Clarity',
        'The prompt should clearly ask for a sum of numbers.',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000202',
        'Mathematical Precision',
        'The prompt should specify the exact mathematical operation (summation).',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000203',
        'Input Format Specification',
        'The prompt should specify the format of the input numbers.',
        '00000000-0000-0000-0000-000000000002'
    ),
    (
        '00000000-0000-0000-0000-000000000204',
        'Output Format Specification',
        'The prompt should specify the expected format of the output.',
        '00000000-0000-0000-0000-000000000002'
    ),
    
    -- Challenge 3 Criteria
    (
        '00000000-0000-0000-0000-000000000301',
        'Clarity',
        'The prompt should clearly ask for finding the maximum number.',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000302',
        'Mathematical Precision',
        'The prompt should specify the exact operation (finding maximum value).',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000303',
        'Input Format Specification',
        'The prompt should specify the format of the input numbers.',
        '00000000-0000-0000-0000-000000000003'
    ),
    (
        '00000000-0000-0000-0000-000000000304',
        'Edge Cases Consideration',
        'The prompt should address potential edge cases (equal values, negative numbers).',
        '00000000-0000-0000-0000-000000000003'
    );

-- Populate nova_problems
insert into
    public.nova_problems (
        id,
        title,
        description,
        challenge_id,
        example_input,
        example_output,
        max_prompt_length
    )
values
    (
        '00000000-0000-0000-0000-000000000001',
        'Color the fruits',
        'Given a list of fruits, produce a list of colors for each fruit.',
        '00000000-0000-0000-0000-000000000001',
        'Cherry, Apple, Banana',
        'Red, Green, Yellow',
        300
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Capital cities by country',
        'Given a list of countries, provide their capital cities.',
        '00000000-0000-0000-0000-000000000001',
        'France, Japan, Brazil',
        'Paris, Tokyo, Brasília',
        300
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Animal sounds',
        'Given a list of animals, provide the sounds they make.',
        '00000000-0000-0000-0000-000000000001',
        'Dog, Cat, Cow',
        'Woof, Meow, Moo',
        300
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'Sum the numbers',
        'Given a list of numbers, produce the sum of all numbers.',
        '00000000-0000-0000-0000-000000000002',
        '1, 2, 3, 4, 5',
        '15',
        100
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'Calculate the average',
        'Given a list of numbers, calculate their average (mean).',
        '00000000-0000-0000-0000-000000000002',
        '10, 20, 30, 40, 50',
        '30',
        100
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'Multiply the numbers',
        'Given a list of numbers, calculate their product.',
        '00000000-0000-0000-0000-000000000002',
        '1, 2, 3, 4',
        '24',
        100
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        'Find the maximum number',
        'Given a list of numbers, produce the maximum number.',
        '00000000-0000-0000-0000-000000000003',
        '1, 2, 3, 4, 5',
        '5',
        100
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        'Find the minimum number',
        'Given a list of numbers, find the smallest number.',
        '00000000-0000-0000-0000-000000000003',
        '5, 3, 9, 1, 7',
        '1',
        100
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        'Find the second largest number',
        'Given a list of numbers, find the second largest value.',
        '00000000-0000-0000-0000-000000000003',
        '5, 3, 9, 1, 7',
        '7',
        100
    );

-- Populate nova_problem_test_cases (10 test cases per problem)
insert into
    public.nova_problem_test_cases (id, problem_id, input, output, hidden)
values
    -- Problem 1 Test Cases (Color the fruits)
    (
        '00000000-0000-0000-0000-000000001001',
        '00000000-0000-0000-0000-000000000001',
        'Apple, Banana, Cherry',
        'Green, Yellow, Red',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001002',
        '00000000-0000-0000-0000-000000000001',
        'Strawberry, Blueberry, Blackberry',
        'Red, Blue, Black',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001003',
        '00000000-0000-0000-0000-000000000001',
        'Orange, Lemon, Lime',
        'Orange, Yellow, Green',
        true
    ),
    (
        '00000000-0000-0000-0000-000000001004',
        '00000000-0000-0000-0000-000000000001',
        'Grape, Watermelon, Kiwi',
        'Purple, Green, Brown',
        true
    ),
    (
        '00000000-0000-0000-0000-000000001005',
        '00000000-0000-0000-0000-000000000001',
        'Pineapple, Mango, Papaya',
        'Brown, Yellow, Orange',
        true
    ),
    
    -- Problem 2 Test Cases (Capital cities by country)
    (
        '00000000-0000-0000-0000-000000002001',
        '00000000-0000-0000-0000-000000000002',
        'USA, UK, France',
        'Washington D.C., London, Paris',
        false
    ),
    (
        '00000000-0000-0000-0000-000000002002',
        '00000000-0000-0000-0000-000000000002',
        'Japan, China, South Korea',
        'Tokyo, Beijing, Seoul',
        false
    ),
    (
        '00000000-0000-0000-0000-000000002003',
        '00000000-0000-0000-0000-000000000002',
        'Germany, Italy, Spain',
        'Berlin, Rome, Madrid',
        true
    ),
    (
        '00000000-0000-0000-0000-000000002004',
        '00000000-0000-0000-0000-000000000002',
        'Canada, Mexico, Brazil',
        'Ottawa, Mexico City, Brasília',
        true
    ),
    (
        '00000000-0000-0000-0000-000000002005',
        '00000000-0000-0000-0000-000000000002',
        'Australia, New Zealand, Indonesia',
        'Canberra, Wellington, Jakarta',
        true
    ),
    
    -- Problem 3 Test Cases (Animal sounds)
    (
        '00000000-0000-0000-0000-000000003001',
        '00000000-0000-0000-0000-000000000003',
        'Cat, Dog, Lion',
        'Meow, Bark/Woof, Roar',
        false
    ),
    (
        '00000000-0000-0000-0000-000000003002',
        '00000000-0000-0000-0000-000000000003',
        'Cow, Pig, Sheep',
        'Moo, Oink, Baa',
        false
    ),
    (
        '00000000-0000-0000-0000-000000003003',
        '00000000-0000-0000-0000-000000000003',
        'Horse, Donkey, Goat',
        'Neigh, Hee-haw, Meh',
        true
    ),
    (
        '00000000-0000-0000-0000-000000003004',
        '00000000-0000-0000-0000-000000000003',
        'Chicken, Duck, Turkey',
        'Cluck, Quack, Gobble',
        true
    ),
    (
        '00000000-0000-0000-0000-000000003005',
        '00000000-0000-0000-0000-000000000003',
        'Frog, Owl, Wolf',
        'Ribbit, Hoot, Howl',
        true
    ),

    -- Problem 4 Test Cases (Sum the numbers)
    (
        '00000000-0000-0000-0000-000000004001',
        '00000000-0000-0000-0000-000000000004',
        '1, 2, 3, 4, 5',
        '15',
        false
    ),
    (
        '00000000-0000-0000-0000-000000004002',
        '00000000-0000-0000-0000-000000000004',
        '10, 20, 30, 40, 50',
        '150',
        false
    ),
    (
        '00000000-0000-0000-0000-000000004003',
        '00000000-0000-0000-0000-000000000004',
        '5, 10, 15, 20, 25',
        '75',
        true
    ),
    (
        '00000000-0000-0000-0000-000000004004',
        '00000000-0000-0000-0000-000000000004',
        '2, 4, 6, 8, 10',
        '30',
        true
    ),
    (
        '00000000-0000-0000-0000-000000004005',
        '00000000-0000-0000-0000-000000000004',
        '1, 3, 5, 7, 9',
        '25',
        true
    ),
    
    -- Problem 5 Test Cases (Calculate the average)
    (
        '00000000-0000-0000-0000-000000005001',
        '00000000-0000-0000-0000-000000000005',
        '10, 20, 30, 40, 50',
        '30',
        false
    ),
    (
        '00000000-0000-0000-0000-000000005002',
        '00000000-0000-0000-0000-000000000005',
        '5, 10, 15, 20, 25',
        '15',
        false
    ),
    (
        '00000000-0000-0000-0000-000000005003',
        '00000000-0000-0000-0000-000000000005',
        '2, 4, 6, 8, 10',
        '6',
        true
    ),
    (
        '00000000-0000-0000-0000-000000005004',
        '00000000-0000-0000-0000-000000000005',
        '1, 1, 1, 1, 1',
        '1',
        true
    ),
    (
        '00000000-0000-0000-0000-000000005005',
        '00000000-0000-0000-0000-000000000005',
        '100, 200, 300, 400, 500',
        '300',
        true
    ),
    
    -- Problem 6 Test Cases (Multiply the numbers)
    (
        '00000000-0000-0000-0000-000000006001',
        '00000000-0000-0000-0000-000000000006',
        '1, 2, 3, 4',
        '24',
        false
    ),
    (
        '00000000-0000-0000-0000-000000006002',
        '00000000-0000-0000-0000-000000000006',
        '5, 6, 7, 8',
        '1680',
        false
    ),
    (
        '00000000-0000-0000-0000-000000006003',
        '00000000-0000-0000-0000-000000000006',
        '2, 3, 4, 5',
        '120',
        true
    ),
    (
        '00000000-0000-0000-0000-000000006004',
        '00000000-0000-0000-0000-000000000006',
        '1, 1, 1, 1',
        '1',
        true
    ),
    (
        '00000000-0000-0000-0000-000000006005',
        '00000000-0000-0000-0000-000000000006',
        '0, 1, 2, 3',
        '0',
        true
    ),
    
    -- Problem 7 Test Cases (Find the maximum number)
    (
        '00000000-0000-0000-0000-000000007001',
        '00000000-0000-0000-0000-000000000007',
        '1, 2, 3, 4, 5',
        '5',
        false
    ),
    (
        '00000000-0000-0000-0000-000000007002',
        '00000000-0000-0000-0000-000000000007',
        '5, 4, 3, 2, 1',
        '5',
        false
    ),
    (
        '00000000-0000-0000-0000-000000007003',
        '00000000-0000-0000-0000-000000000007',
        '10, 20, 30, 40, 50',
        '50',
        true
    ),
    (
        '00000000-0000-0000-0000-000000007004',
        '00000000-0000-0000-0000-000000000007',
        '5, 5, 5, 5, 5',
        '5',
        true
    ),
    (
        '00000000-0000-0000-0000-000000007005',
        '00000000-0000-0000-0000-000000000007',
        '-5, -4, -3, -2, -1',
        '-1',
        true
    ),
    
    -- Problem 8 Test Cases (Find the minimum number)
    (
        '00000000-0000-0000-0000-000000008001',
        '00000000-0000-0000-0000-000000000008',
        '5, 3, 9, 1, 7',
        '1',
        false
    ),
    (
        '00000000-0000-0000-0000-000000008002',
        '00000000-0000-0000-0000-000000000008',
        '10, 20, 30, 40, 50',
        '10',
        false
    ),
    (
        '00000000-0000-0000-0000-000000008003',
        '00000000-0000-0000-0000-000000000008',
        '5, 4, 3, 2, 1',
        '1',
        true
    ),
    (
        '00000000-0000-0000-0000-000000008004',
        '00000000-0000-0000-0000-000000000008',
        '5, 5, 5, 5, 5',
        '5',
        true
    ),
    (
        '00000000-0000-0000-0000-000000008005',
        '00000000-0000-0000-0000-000000000008',
        '-5, -4, -3, -2, -1',
        '-5',
        true
    ),
    
    -- Problem 9 Test Cases (Find the second largest number)
    (
        '00000000-0000-0000-0000-000000009001',
        '00000000-0000-0000-0000-000000000009',
        '5, 3, 9, 1, 7',
        '7',
        false
    ),
    (
        '00000000-0000-0000-0000-000000009002',
        '00000000-0000-0000-0000-000000000009',
        '10, 20, 30, 40, 50',
        '40',
        false
    ),
    (
        '00000000-0000-0000-0000-000000009003',
        '00000000-0000-0000-0000-000000000009',
        '5, 4, 3, 2, 1',
        '4',
        true
    ),
    (
        '00000000-0000-0000-0000-000000009004',
        '00000000-0000-0000-0000-000000000009',
        '5, 5, 5, 5, 4',
        '5',
        true
    ),
    (
        '00000000-0000-0000-0000-000000009005',
        '00000000-0000-0000-0000-000000000009',
        '-5, -4, -3, -2, -1',
        '-2',
        true
    );

-- Populate nova_sessions
-- Each user has 2 sessions for each of the 3 challenges (total of 24 sessions)
INSERT INTO 
    public.nova_sessions (id, user_id, challenge_id, status, start_time, end_time)
VALUES
    -- User 1 (00000000-0000-0000-0000-000000000002) sessions for Challenge 1
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '30 minutes'),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '25 minutes'),
    
    -- User 1 sessions for Challenge 2
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '40 minutes'),
    ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '35 minutes'),
    
    -- User 1 sessions for Challenge 3
    ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days' + INTERVAL '50 minutes'),
    ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '45 minutes'),
    
    -- User 2 (00000000-0000-0000-0000-000000000003) sessions for Challenge 1
    ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '28 minutes'),
    ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '32 minutes'),
    
    -- User 2 sessions for Challenge 2
    ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '38 minutes'),
    ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '36 minutes'),
    
    -- User 2 sessions for Challenge 3
    ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days' + INTERVAL '48 minutes'),
    ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '52 minutes'),
    
    -- User 3 (00000000-0000-0000-0000-000000000004) sessions for Challenge 1
    ('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '29 minutes'),
    ('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '27 minutes'),
    
    -- User 3 sessions for Challenge 2
    ('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '42 minutes'),
    ('10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '39 minutes'),
    
    -- User 3 sessions for Challenge 3
    ('10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days' + INTERVAL '55 minutes'),
    ('10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '50 minutes'),
    
    -- User 4 (00000000-0000-0000-0000-000000000005) sessions for Challenge 1
    ('10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '31 minutes'),
    ('10000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'ENDED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '29 minutes'),
    
    -- User 4 sessions for Challenge 2
    ('10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '41 minutes'),
    ('10000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'ENDED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '37 minutes'),
    
    -- User 4 sessions for Challenge 3
    ('10000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '53 minutes'),
    ('10000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'ENDED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '48 minutes');

-- Populate nova_submissions
-- Each session has 2 submissions (total of 48 submissions)
-- Using problems from the corresponding challenges
INSERT INTO
    public.nova_submissions (id, prompt, session_id, problem_id, user_id)
VALUES
    -- User 1 submissions for Challenge 1 (Sessions 1-2)
    ('20000000-0000-0000-0000-000000000001', 'Given a list of fruits, provide the color of each fruit in the same order.', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000002', 'List the countries and their capital cities in matching order.', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000003', 'Output the characteristic color for each fruit in the input list.', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000004', 'For each animal listed, provide the sound it makes.', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002'),
    
    -- User 1 submissions for Challenge 2 (Sessions 3-4)
    ('20000000-0000-0000-0000-000000000005', 'Calculate the sum of all numbers in the input list.', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000006', 'Find the average (mean) of the provided list of numbers.', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000007', 'Multiply all numbers in the given list to find their product.', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000008', 'Add all the numbers in the list and return their sum.', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002'),
    
    -- User 1 submissions for Challenge 3 (Sessions 5-6)
    ('20000000-0000-0000-0000-000000000009', 'Find and return the largest number from the input list.', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000010', 'Identify the smallest number in the given list.', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000011', 'Return the second highest value from the list of numbers.', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000012', 'Find the maximum number in the given sequence.', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002'),
    
    -- User 2 submissions for Challenge 1 (Sessions 7-8)
    ('20000000-0000-0000-0000-000000000013', 'For each fruit in the list, provide its typical color.', '10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000014', 'Match each country with its capital city.', '10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000015', 'List the sounds that each animal makes.', '10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000016', 'Identify the color associated with each fruit.', '10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
    
    -- User 2 submissions for Challenge 2 (Sessions 9-10)
    ('20000000-0000-0000-0000-000000000017', 'Add up all numbers in the list and return the total.', '10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000018', 'Calculate the mean (average) of all numbers provided.', '10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000019', 'Calculate the product by multiplying all numbers together.', '10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000020', 'Sum up all the numbers in the provided list.', '10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003'),
    
    -- User 2 submissions for Challenge 3 (Sessions 11-12)
    ('20000000-0000-0000-0000-000000000021', 'Return the largest number from the input list.', '10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000022', 'Find the minimum value in the given number list.', '10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000023', 'Find the second highest number in the list.', '10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000024', 'Determine the maximum value from the given numbers.', '10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003'),
    
    -- User 3 submissions for Challenge 1 (Sessions 13-14)
    ('20000000-0000-0000-0000-000000000025', 'List the colors that correspond to each fruit.', '10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000026', 'Provide the capital city for each country listed.', '10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000027', 'What noise does each animal make?', '10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000028', 'Output each fruit with its corresponding color.', '10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
    
    -- User 3 submissions for Challenge 2 (Sessions 15-16)
    ('20000000-0000-0000-0000-000000000029', 'Calculate the sum of all numbers in the sequence.', '10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000030', 'Find the arithmetic mean of all provided numbers.', '10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000031', 'Multiply all the given numbers together.', '10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000032', 'Add all numbers together and return the result.', '10000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),
    
    -- User 3 submissions for Challenge 3 (Sessions 17-18)
    ('20000000-0000-0000-0000-000000000033', 'What is the highest number in the input list?', '10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000034', 'Find the smallest value from the given numbers.', '10000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000035', 'Identify the second largest number in the sequence.', '10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000036', 'Return the maximum number from the list.', '10000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004'),
    
    -- User 4 submissions for Challenge 1 (Sessions 19-20)
    ('20000000-0000-0000-0000-000000000037', 'Provide the typical color of each fruit in the input.', '10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000038', 'For each country, output its capital city.', '10000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000039', 'What sound does each of these animals make?', '10000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000040', 'Match each fruit with its characteristic color.', '10000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'),
    
    -- User 4 submissions for Challenge 2 (Sessions 21-22)
    ('20000000-0000-0000-0000-000000000041', 'Sum up all the numbers in the input list.', '10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000042', 'Calculate the average of all numbers provided.', '10000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000043', 'Find the product of all numbers in the list.', '10000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000044', 'Add all the numbers and return their sum.', '10000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005'),
    
    -- User 4 submissions for Challenge 3 (Sessions 23-24)
    ('20000000-0000-0000-0000-000000000045', 'Find the maximum number in the provided list.', '10000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000046', 'Return the minimum value from the given list.', '10000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000047', 'Which number is the second largest in the list?', '10000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000048', 'What is the largest number in the sequence?', '10000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000005');

INSERT INTO
    public.nova_submission_test_cases (submission_id, test_case_id, output, matched)
VALUES
    -- User 1 submissions for Challenge 1 (Submissions 1-4)
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', 'Red, Yellow, Green', false),
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002001', 'Washington D.C., London, Paris', true),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002002', 'Tokyo, Beijing, Seoul', true),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000003001', 'Meow, Bark, Roar', false),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000003002', 'Moo, Oink, Baa', true),
    
    -- User 1 submissions for Challenge 2 (Submissions 5-8)
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000004002', '150', true),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000005001', '30', true),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000005002', '15', true),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000006001', '24', true),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000006002', '1680', true),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000004002', '150', true),
    
    -- User 1 submissions for Challenge 3 (Submissions 9-12)
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000007002', '50', true),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000008001', '1', true),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000008002', '1', true),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000009001', '7', true),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000009002', '40', true),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000007002', '50', true),
    
    -- User 2 submissions for Challenge 1 (Submissions 13-16)
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000002001', 'Washington D.C., London, Paris', true),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000002002', 'Tokyo, Beijing, Seoul', true),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000003001', 'Meow, Bark/Woof, Roar', true),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000003002', 'Moo, Oink, Baa', true),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    
    -- User 2 submissions for Challenge 2 (Submissions 17-20)
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000004002', '151', false),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000005001', '30', true),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000005002', '15', true),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000006001', '24', true),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000006002', '1680', true),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000004002', '150', true),
    
    -- User 2 submissions for Challenge 3 (Submissions 21-24)
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000007002', '50', true),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000008001', '1', true),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000008002', '1', true),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000009001', '7', true),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000009002', '40', true),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000007002', '50', true),
    
    -- User 3 submissions for Challenge 1 (Submissions 25-28)
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000001001', 'Red, Yellow, Green', false),
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000002001', 'Washington D.C., London, Paris', true),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000002002', 'Tokyo, Beijing, Seoul', true),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000003001', 'Meow, Bark/Woof, Roar', true),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000003002', 'Moo, Oink, Baa', true),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    
    -- User 3 submissions for Challenge 2 (Submissions 29-32)
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000004002', '150', true),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000005001', '30', true),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000005002', '14.5', false),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000006001', '24', true),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000006002', '1680', true),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000004002', '150', true),
    
    -- User 3 submissions for Challenge 3 (Submissions 33-36)
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000007002', '50', true),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000008001', '1', true),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000008002', '2', false),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000009001', '7', true),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000009002', '40', true),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000007002', '50', true),
    
    -- User 4 submissions for Challenge 1 (Submissions 37-40)
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000002001', 'Washington D.C., London, Paris', true),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000002002', 'Tokyo, Beijing, Seoul', true),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000003001', 'Meow, Bark/Woof, Roar', true),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000003002', 'Moo, Oink, Baa', true),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000001001', 'Green, Yellow, Red', true),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000001002', 'Red, Blue, Black', true),
    
    -- User 4 submissions for Challenge 2 (Submissions 41-44)
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000004002', '150', true),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000005001', '30', true),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000005002', '15', true),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000006001', '24', true),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000006002', '1670', false),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000004001', '15', true),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000004002', '150', true),
    
    -- User 4 submissions for Challenge 3 (Submissions 45-48)
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000007002', '50', true),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000008001', '1', true),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000008002', '1', true),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000009001', '7', true),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000009002', '40', true),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000007001', '5', true),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000007002', '50', true);

INSERT INTO
    public.nova_submission_criteria (submission_id, criteria_id, score, feedback)
VALUES
    -- User 1 submissions for Challenge 1 (Submissions 1-4)
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 8.5, 'Good clarity in prompt structure, but could be more explicit with instructions.'),
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 7.8, 'Specific about fruits and colors, but lacks some detail.'),
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 9.2, 'Excellent formatting with proper punctuation and grammar.'),
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 8.7, 'Highly relevant to the problem domain.'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', 9.0, 'Very clear and direct instructions.'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000102', 8.3, 'Good specificity about countries and capitals.'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000103', 8.9, 'Well-formatted with proper structure.'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000104', 7.5, 'Relevant but could use more contextual information.'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000101', 9.4, 'Excellent clarity with precise instructions.'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000102', 8.8, 'Highly specific about fruit colors.'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000103', 9.0, 'Very well formatted with proper language.'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000104', 9.5, 'Perfectly relevant to the problem domain.'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000101', 8.2, 'Clear instructions but could be more direct.'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000102', 7.9, 'Specific about animals and sounds but lacks detail.'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000103', 8.5, 'Well-formatted with minor grammar issues.'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000104', 7.8, 'Relevant but slightly off topic.'),

    -- User 1 submissions for Challenge 2 (Submissions 5-8)
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000201', 9.2, 'Very clear instructions for summation.'),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000202', 8.7, 'Precise mathematical operation specified.'),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000203', 7.5, 'Input format mentioned but not detailed enough.'),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000204', 8.0, 'Output format is specified but could be clearer.'),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000201', 8.8, 'Clear instructions for calculating average.'),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000202', 9.1, 'Mathematical precision is excellent.'),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000203', 8.4, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000204', 8.9, 'Output format well specified.'),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000201', 7.9, 'Instructions are clear but could be more direct.'),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000202', 8.5, 'Mathematical operation correctly specified.'),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000203', 7.8, 'Input format is basic but functional.'),
    ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000204', 8.2, 'Output format specified adequately.'),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000201', 9.5, 'Exceptionally clear instructions for summation.'),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000202', 9.3, 'Perfect mathematical precision.'),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000203', 8.9, 'Input format well described.'),
    ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000204', 9.0, 'Output format clearly specified.'),

    -- User 1 submissions for Challenge 3 (Submissions 9-12)
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000301', 9.0, 'Very clear instructions for finding maximum.'),
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000302', 8.8, 'Mathematical operation well specified.'),
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000303', 8.5, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000304', 7.2, 'Some edge cases mentioned but not comprehensive.'),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000301', 8.7, 'Clear instructions for finding minimum.'),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000302', 9.2, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000303', 8.4, 'Input format adequately described.'),
    ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000304', 7.8, 'Some edge cases considered.'),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', 8.3, 'Clear but could be more explicit for second highest.'),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000302', 8.9, 'Mathematical operation well described.'),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000303', 7.9, 'Input format is basic but functional.'),
    ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000304', 8.2, 'Good consideration of edge cases like duplicates.'),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000301', 9.4, 'Exceptionally clear instructions for maximum.'),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000302', 9.1, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000303', 8.7, 'Input format well described.'),
    ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000304', 8.5, 'Good handling of edge cases.'),

    -- User 2 submissions for Challenge 1 (Submissions 13-16)
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000101', 8.9, 'Very clear instructions for fruit colors.'),
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000102', 8.2, 'Good specificity about types of fruits.'),
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000103', 9.3, 'Excellent formatting and grammar.'),
    ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000104', 9.1, 'Highly relevant to the fruits domain.'),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000101', 9.5, 'Extremely clear instructions for matching countries.'),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000102', 9.0, 'Very specific about country-capital pairs.'),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000103', 8.8, 'Well-formatted with proper punctuation.'),
    ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000104', 8.5, 'Relevant but could include more context.'),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000101', 9.2, 'Clear instructions for animal sounds.'),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000102', 8.7, 'Specific about types of animals.'),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000103', 8.9, 'Well-formatted with good structure.'),
    ('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000104', 7.8, 'Somewhat relevant but strays from core topic.'),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000101', 8.4, 'Clear but could be more direct for fruit colors.'),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000102', 7.9, 'Specific but lacks some details.'),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000103', 8.6, 'Good formatting with minor issues.'),
    ('20000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000104', 9.0, 'Highly relevant to the problem domain.'),

    -- User 2 submissions for Challenge 2 (Submissions 17-20)
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000201', 8.5, 'Clear instructions for adding numbers.'),
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000202', 8.8, 'Mathematical operation well specified.'),
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000203', 7.9, 'Input format mentioned but not detailed.'),
    ('20000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000204', 7.6, 'Output format could be clearer.'),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000201', 9.1, 'Very clear instructions for averaging.'),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000202', 9.4, 'Excellent mathematical precision for mean calculation.'),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000203', 8.3, 'Input format well described.'),
    ('20000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000204', 8.7, 'Output format clearly specified.'),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000201', 8.3, 'Clear but could be more direct for multiplication.'),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000202', 9.0, 'Mathematical operation precisely described.'),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000203', 8.1, 'Input format adequately specified.'),
    ('20000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000204', 7.5, 'Output format could be more detailed.'),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000201', 9.3, 'Excellent clarity for summation instruction.'),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000202', 8.9, 'Mathematical operation well described.'),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000203', 8.4, 'Input format clearly specified.'),
    ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000204', 8.8, 'Output format well defined.'),

    -- User 2 submissions for Challenge 3 (Submissions 21-24)
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000301', 9.2, 'Very clear instructions for finding maximum.'),
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000302', 8.9, 'Mathematical operation well specified.'),
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000303', 8.5, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000304', 7.8, 'Some edge cases considered but not all.'),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000301', 8.8, 'Clear instructions for finding minimum value.'),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000302', 9.0, 'Mathematical precision is excellent.'),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000303', 8.3, 'Input format well described.'),
    ('20000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000304', 8.1, 'Edge cases adequately addressed.'),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000301', 8.5, 'Clear instructions for second highest number.'),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000302', 8.7, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000303', 7.9, 'Input format mentioned but lacks detail.'),
    ('20000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000304', 8.4, 'Good consideration of edge cases.'),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000301', 9.5, 'Extremely clear instructions for maximum value.'),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000302', 9.2, 'Mathematical precision is excellent.'),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000303', 8.8, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000304', 8.6, 'Edge cases well considered.'),

    -- User 3 submissions for Challenge 1 (Submissions 25-28)
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000101', 8.1, 'Clear but color order is not aligned with expected output.'),
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000102', 7.8, 'Specific about fruits but lacks some details.'),
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000103', 8.5, 'Good formatting with minor grammar issues.'),
    ('20000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000104', 8.9, 'Highly relevant to the problem domain.'),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000101', 9.3, 'Very clear instructions for country capitals.'),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000102', 8.7, 'Specific about country details.'),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000103', 9.1, 'Excellent formatting and structure.'),
    ('20000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000104', 8.4, 'Relevant but could include more context.'),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000101', 8.9, 'Clear question format for animal sounds.'),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000102', 8.2, 'Specific but could elaborate more on animal types.'),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000103', 8.7, 'Well-formatted with proper punctuation.'),
    ('20000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000104', 8.0, 'Relevant to animal domain.'),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000101', 9.0, 'Very clear instructions for fruit colors.'),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000102', 8.5, 'Specific about matching fruits and colors.'),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000103', 8.8, 'Well-formatted with good structure.'),
    ('20000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000104', 9.2, 'Highly relevant to the problem domain.'),

    -- User 3 submissions for Challenge 2 (Submissions 29-32)
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000201', 9.1, 'Very clear instructions for summation.'),
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000202', 8.8, 'Mathematical operation well specified.'),
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000203', 8.2, 'Input format adequately described.'),
    ('20000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000204', 8.5, 'Output format clearly specified.'),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000201', 8.7, 'Clear instructions for calculating mean.'),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000202', 9.2, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000203', 7.9, 'Input format mentioned but could be clearer.'),
    ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000204', 7.5, 'Output format needs more detail (incorrect output).'),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000201', 8.4, 'Clear instructions for multiplication.'),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000202', 8.9, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000203', 7.8, 'Input format is basic but functional.'),
    ('20000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000204', 8.3, 'Output format clearly specified.'),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000201', 9.4, 'Extremely clear instructions for addition.'),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000202', 9.0, 'Mathematical operation precisely described.'),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000203', 8.5, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000204', 8.7, 'Output format well defined.'),

    -- User 3 submissions for Challenge 3 (Submissions 33-36)
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000301', 9.2, 'Very clear question format for finding maximum.'),
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000302', 8.8, 'Mathematical operation well specified.'),
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000303', 8.4, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000304', 7.9, 'Edge cases partially addressed.'),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000301', 8.6, 'Clear instructions for finding minimum.'),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000302', 8.9, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000303', 8.1, 'Input format adequately described.'),
    ('20000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000304', 6.8, 'Edge cases poorly handled (incorrect output).'),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000301', 8.7, 'Clear instructions for second largest number.'),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000302', 9.0, 'Mathematical operation precisely described.'),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000303', 8.3, 'Input format well specified.'),
    ('20000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000304', 8.5, 'Edge cases well considered.'),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000301', 9.3, 'Very clear instructions for maximum value.'),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000302', 9.1, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000303', 8.6, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000304', 8.2, 'Edge cases adequately addressed.'),

    -- User 4 submissions for Challenge 1 (Submissions 37-40)
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000101', 9.4, 'Extremely clear instructions for fruit colors.'),
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000102', 8.9, 'Very specific about types of fruits.'),
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000103', 9.0, 'Excellent formatting and grammar.'),
    ('20000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000104', 9.3, 'Highly relevant to the problem domain.'),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000000101', 9.1, 'Very clear instructions for country capitals.'),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000000102', 8.6, 'Specific about countries but could add more detail.'),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000000103', 8.8, 'Well-formatted with good grammar.'),
    ('20000000-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000000104', 8.5, 'Relevant but could include more context.'),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000101', 9.0, 'Very clear question format for animal sounds.'),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000102', 8.5, 'Specific about types of animals.'),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000103', 8.7, 'Well-formatted with proper punctuation.'),
    ('20000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000104', 8.3, 'Relevant to the animal domain.'),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000101', 8.9, 'Clear instructions for matching fruits with colors.'),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000102', 8.7, 'Specific about fruit characteristics.'),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000103', 9.1, 'Excellent formatting and structure.'),
    ('20000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000104', 9.2, 'Highly relevant to the problem domain.'),

    -- User 4 submissions for Challenge 2 (Submissions 41-44)
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000201', 9.0, 'Very clear instructions for summation.'),
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000202', 8.7, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000203', 8.4, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000204', 8.6, 'Output format well specified.'),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000201', 8.8, 'Clear instructions for calculating average.'),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000202', 9.3, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000203', 8.5, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000204', 8.9, 'Output format well defined.'),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000201', 8.5, 'Clear instructions for finding product.'),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000202', 8.8, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000203', 8.1, 'Input format adequately described.'),
    ('20000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000204', 7.3, 'Output format could be clearer (incorrect output).'),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000201', 9.2, 'Very clear instructions for summation.'),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000202', 8.9, 'Mathematical operation precisely described.'),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000203', 8.6, 'Input format clearly defined.'),
    ('20000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000204', 8.7, 'Output format well specified.'),
    
    -- User 4 submissions for Challenge 3 (Submissions 45-48)
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000301', 9.3, 'Very clear instructions for finding maximum.'),
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000302', 9.0, 'Mathematical operation precisely described.'),
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000303', 8.7, 'Input format clearly specified.'),
    ('20000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000304', 8.2, 'Edge cases adequately addressed.'),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000301', 8.9, 'Clear instructions for finding minimum.'),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000302', 9.1, 'Excellent mathematical precision for minimum value.'),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000303', 8.5, 'Input format well described.'),
    ('20000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000304', 8.0, 'Most edge cases addressed.'),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000301', 8.6, 'Clear instructions for finding second largest.'),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000302', 8.8, 'Mathematical operation well defined.'),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000303', 8.3, 'Input format clearly described.'),
    ('20000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000304', 9.2, 'Excellent handling of edge cases like duplicates.'),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000301', 9.4, 'Exceptionally clear instructions for maximum value.'),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000302', 9.2, 'Excellent mathematical precision.'),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000303', 8.9, 'Input format well defined with clear examples.'),
    ('20000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000304', 8.6, 'Edge cases well considered and addressed.');


-- Populate workspace_calendar_events for a full week
insert into
    public.workspace_calendar_events (
        id,
        ws_id,
        title,
        description,
        start_at,
        end_at,
        location
    )
values
    -- Day 1 events
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'Team Meeting',
        'Weekly sync with the whole team',
        now()::date + '9 hours'::interval,
        now()::date + '10 hours'::interval,
        'Conference Room A'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'Product Demo',
        'Showing new features to stakeholders',
        now()::date + '14 hours'::interval,
        now()::date + '15 hours'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        'Sprint Planning',
        'Planning tasks for the next sprint',
        now()::date + '1 day'::interval + '10 hours'::interval,
        now()::date + '1 day'::interval + '12 hours'::interval,
        'Virtual'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000002',
        'Code Review',
        'Reviewing pull requests',
        now()::date + '2 days'::interval + '13 hours'::interval,
        now()::date + '2 days'::interval + '14 hours'::interval,
        'Dev Room'
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000003',
        'Pharmacy Staff Meeting',
        'Monthly staff meeting',
        now()::date + '3 days'::interval + '9 hours'::interval,
        now()::date + '3 days'::interval + '10 hours'::interval,
        'Pharmacy Office'
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000004',
        'Parent-Teacher Conference',
        'Discussing student progress',
        now()::date + '3 days'::interval + '15 hours'::interval,
        now()::date + '3 days'::interval + '17 hours'::interval,
        'School Auditorium'
    ),
    (
        '00000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000000',
        'Design Workshop',
        'Brainstorming UI/UX improvements',
        now()::date + '4 days'::interval + '10 hours'::interval,
        now()::date + '4 days'::interval + '12 hours'::interval,
        'Creative Room'
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000001',
        'Client Meeting',
        'Discussing project requirements',
        now()::date + '5 days'::interval + '11 hours'::interval,
        now()::date + '5 days'::interval + '12 hours'::interval,
        'Meeting Room B'
    ),
    (
        '00000000-0000-0000-0000-000000000009',
        '00000000-0000-0000-0000-000000000000',
        'Team Building',
        'Fun activities to improve team bonding',
        now()::date + '6 days'::interval + '14 hours'::interval,
        now()::date + '6 days'::interval + '17 hours'::interval,
        'Central Park'
    ),
    (
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000002',
        'Weekly Retrospective',
        'Discussing what went well and improvements',
        now()::date + '6 days'::interval + '10 hours'::interval,
        now()::date + '6 days'::interval + '11 hours'::interval,
        'Conference Room C'
    ),
    
    -- Additional events for Day 1
    (
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000000',
        'Morning Stand-up',
        'Daily team stand-up meeting',
        now()::date + '8 hours'::interval,
        now()::date + '8 hours 15 minutes'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000012',
        '00000000-0000-0000-0000-000000000001',
        'Backend Review',
        'Review backend API changes',
        now()::date + '11 hours'::interval,
        now()::date + '12 hours'::interval,
        'Virtual'
    ),
    (
        '00000000-0000-0000-0000-000000000013',
        '00000000-0000-0000-0000-000000000002',
        'Frontend Planning',
        'Planning frontend tasks',
        now()::date + '16 hours'::interval,
        now()::date + '17 hours'::interval,
        'Meeting Room A'
    ),
    
    -- Additional events for Day 2
    (
        '00000000-0000-0000-0000-000000000014',
        '00000000-0000-0000-0000-000000000000',
        'Morning Stand-up',
        'Daily team stand-up meeting',
        now()::date + '1 day'::interval + '8 hours'::interval,
        now()::date + '1 day'::interval + '8 hours 15 minutes'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000015',
        '00000000-0000-0000-0000-000000000003',
        'Inventory Check',
        'Monthly inventory audit',
        now()::date + '1 day'::interval + '14 hours'::interval,
        now()::date + '1 day'::interval + '16 hours'::interval,
        'Warehouse'
    ),
    (
        '00000000-0000-0000-0000-000000000016',
        '00000000-0000-0000-0000-000000000004',
        'Teacher Meeting',
        'Curriculum planning',
        now()::date + '1 day'::interval + '16 hours 30 minutes'::interval,
        now()::date + '1 day'::interval + '17 hours 30 minutes'::interval,
        'Staff Room'
    ),
    
    -- Additional events for Day 3
    (
        '00000000-0000-0000-0000-000000000017',
        '00000000-0000-0000-0000-000000000000',
        'Morning Stand-up',
        'Daily team stand-up meeting',
        now()::date + '2 days'::interval + '8 hours'::interval,
        now()::date + '2 days'::interval + '8 hours 15 minutes'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000018',
        '00000000-0000-0000-0000-000000000001',
        'Product Planning',
        'Planning product roadmap',
        now()::date + '2 days'::interval + '10 hours'::interval,
        now()::date + '2 days'::interval + '11 hours 30 minutes'::interval,
        'Meeting Room C'
    ),
    (
        '00000000-0000-0000-0000-000000000019',
        '00000000-0000-0000-0000-000000000003',
        'Staff Training',
        'New procedures training',
        now()::date + '2 days'::interval + '15 hours'::interval,
        now()::date + '2 days'::interval + '16 hours'::interval,
        'Training Room'
    ),
    
    -- Additional events for Day 4
    (
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000000',
        'Morning Stand-up',
        'Daily team stand-up meeting',
        now()::date + '3 days'::interval + '8 hours'::interval,
        now()::date + '3 days'::interval + '8 hours 15 minutes'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000002',
        'DevOps Meeting',
        'Deployment planning',
        now()::date + '3 days'::interval + '11 hours'::interval,
        now()::date + '3 days'::interval + '12 hours'::interval,
        'Tech Hub'
    ),
    (
        '00000000-0000-0000-0000-000000000022',
        '00000000-0000-0000-0000-000000000001',
        'Client Call',
        'Weekly progress update',
        now()::date + '3 days'::interval + '13 hours'::interval,
        now()::date + '3 days'::interval + '13 hours 30 minutes'::interval,
        'Virtual'
    ),
    
    -- Additional events for Day 5
    (
        '00000000-0000-0000-0000-000000000023',
        '00000000-0000-0000-0000-000000000000',
        'Morning Stand-up',
        'Daily team stand-up meeting',
        now()::date + '4 days'::interval + '8 hours'::interval,
        now()::date + '4 days'::interval + '8 hours 15 minutes'::interval,
        'Main Office'
    ),
    (
        '00000000-0000-0000-0000-000000000024',
        '00000000-0000-0000-0000-000000000004',
        'School Staff Meeting',
        'End of week review',
        now()::date + '4 days'::interval + '14 hours'::interval,
        now()::date + '4 days'::interval + '15 hours'::interval,
        'Staff Room'
    ),
    (
        '00000000-0000-0000-0000-000000000025',
        '00000000-0000-0000-0000-000000000003',
        'Supplier Meeting',
        'Meeting with new suppliers',
        now()::date + '4 days'::interval + '15 hours 30 minutes'::interval,
        now()::date + '4 days'::interval + '16 hours 30 minutes'::interval,
        'Meeting Room A'
    ),
    
    -- Additional events for Day 6
    (
        '00000000-0000-0000-0000-000000000026',
        '00000000-0000-0000-0000-000000000000',
        'Marketing Meeting',
        'Campaign planning',
        now()::date + '5 days'::interval + '9 hours'::interval,
        now()::date + '5 days'::interval + '10 hours'::interval,
        'Creative Studio'
    ),
    (
        '00000000-0000-0000-0000-000000000027',
        '00000000-0000-0000-0000-000000000002',
        'Tech Meetup',
        'Networking with tech community',
        now()::date + '5 days'::interval + '17 hours'::interval,
        now()::date + '5 days'::interval + '19 hours'::interval,
        'Downtown Hub'
    ),
    (
        '00000000-0000-0000-0000-000000000028',
        '00000000-0000-0000-0000-000000000004',
        'Saturday Class',
        'Extra tutoring session',
        now()::date + '5 days'::interval + '9 hours'::interval,
        now()::date + '5 days'::interval + '12 hours'::interval,
        'Classroom 3'
    ),
    
    -- Additional events for Day 7
    (
        '00000000-0000-0000-0000-000000000029',
        '00000000-0000-0000-0000-000000000001',
        'Remote Work Day',
        'Team working remotely',
        now()::date + '6 days'::interval + '9 hours'::interval,
        now()::date + '6 days'::interval + '17 hours'::interval,
        'Virtual'
    ),
    (
        '00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000003',
        'Weekend Review',
        'Weekly performance review',
        now()::date + '6 days'::interval + '11 hours'::interval,
        now()::date + '6 days'::interval + '12 hours'::interval,
        'Pharmacy Office'
    );