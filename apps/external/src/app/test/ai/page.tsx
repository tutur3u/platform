import { models } from '@tutur3u/ai/models';

export default function Types() {
  return (
    <div>
      <h1>Models</h1>
      <ul>{JSON.stringify(models, null, 2)}</ul>
    </div>
  );
}
