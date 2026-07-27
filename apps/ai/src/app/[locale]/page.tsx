import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export default async function IndexPage() {
  await connection();
  redirect('/personal');
}
