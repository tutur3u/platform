import { FC } from 'react';

interface ContainerProps {
  children: React.ReactNode;
}

const Container: FC<ContainerProps> = ({ children }) => {
  return (
    <div className="grid place-content-center min-h-screen">
      <div className="md:max-w-md w-screen p-4">{children}</div>
    </div>
  );
};

export default Container;
