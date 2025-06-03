import { models } from '@tuturuuu/ai/models';

export default function AI() {
  return (
    <div>
      <h1>Models</h1>
      <ul>{JSON.stringify(models, null, 2)}</ul>
    </div>
  );
}
