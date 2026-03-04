import { notFound } from 'next/navigation';
import BlogsPageClient from './client';

export default function NeoGeneratorPage() {
  // TODO: Remove notFound() when the blogs page is ready to go live
  notFound();
  return <BlogsPageClient />;
}
