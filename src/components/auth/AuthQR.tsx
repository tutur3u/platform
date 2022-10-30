import { Image } from '@mantine/core';
import React from 'react';

const AuthQR = () => {
  return (
    <div className="min-h-[12rem] flex flex-col border">
      <Image
        width={300}
        height={300}
        src="../../../public/media/logos/light.png"
        alt="QR code"
      />
      <div className="font-semibold">Log in with QR code</div>
    </div>
  );
};

export default AuthQR;
