import type { ComponentProps } from 'react';

export default function FixtureImage(props: ComponentProps<'img'>) {
  return <img {...props} alt={props.alt ?? ''} />;
}
