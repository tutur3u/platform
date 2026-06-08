'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import type { StructureProps } from './structure-types';

type StructureImplComponent = ComponentType<StructureProps>;

function useStructureImplComponent() {
  const [StructureImpl, setStructureImpl] =
    useState<StructureImplComponent | null>(null);

  useEffect(() => {
    let active = true;

    void import('./structure-impl').then((module) => {
      if (active) {
        setStructureImpl(() => module.StructureImpl);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return StructureImpl;
}

function StructureFallback({ children }: Pick<StructureProps, 'children'>) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

export function Structure(props: StructureProps) {
  const StructureImpl = useStructureImplComponent();

  if (!StructureImpl) {
    return <StructureFallback>{props.children}</StructureFallback>;
  }

  return <StructureImpl {...props} />;
}
