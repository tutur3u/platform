// apps/upskii/src/lib/pdf/register-roboto-fonts.ts
import { BASE_URL } from '@/constants/common';
import { Font } from '@react-pdf/renderer';

let alreadyRegistered = false;

export function registerRobotoFonts() {
  const baseUrl = `${BASE_URL}/fonts`;
  if (alreadyRegistered) return; // <- guard
  alreadyRegistered = true;

  Font.register({
    family: 'Roboto',
    fonts: [
      { src: `${baseUrl}/Roboto-Regular.ttf` }, // weight 400 (normal)
      { src: `${baseUrl}/Roboto-Light.ttf`, fontWeight: 300 },
      { src: `${baseUrl}/Roboto-Medium.ttf`, fontWeight: 500 },
      { src: `${baseUrl}/Roboto-Bold.ttf`, fontWeight: 'bold' },
    ],
  });
}
