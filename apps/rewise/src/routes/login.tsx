import { createFileRoute, redirect } from '@tanstack/react-router';
export const Route = createFileRoute('/login')({ beforeLoad: () => { throw redirect({ href: 'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Frewise.tuturuuu.com%2F' }); } });
