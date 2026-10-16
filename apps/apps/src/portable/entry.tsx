import { hydrateRoot } from 'react-dom/client';
import { CatalogueEntry } from './catalogue-entry';
import './gateway.css';

const root = document.getElementById('root');
if (root) {
  hydrateRoot(
    root,
    <CatalogueEntry
      locale={document.documentElement.lang === 'vi' ? 'vi' : 'en'}
    />
  );
}
