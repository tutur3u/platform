-- Root-workspace permission for operators who provision QA test users.
alter type public.workspace_role_permission
add value if not exists 'manage_qa_test_users';
