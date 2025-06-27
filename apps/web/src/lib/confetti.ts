import confetti from 'canvas-confetti';

export const fireConfetti = (options?: {
  origin?: { x: number; y: number };
  spread?: number;
  startVelocity?: number;
  elementCount?: number;
  dragFriction?: number;
  duration?: number;
  delay?: number;
  colors?: string[];
}) => {
  const defaults = {
    origin: { x: 0.5, y: 0.5 },
    spread: 360,
    startVelocity: 20,
    elementCount: 70,
    dragFriction: 0.12,
    duration: 3000,
    delay: 0,
    colors: ['#FF5757', '#FFD93D', '#6BCB77', '#4D96FF'],
  };

  confetti({
    ...defaults,
    ...options,
    particleCount: options?.elementCount || defaults.elementCount,
    scalar: 1.2,
    shapes: ['circle', 'square'],
    ticks: 200,
    gravity: 1.2,
    decay: 0.91,
    drift: 0,
  });
};

export const fireSchoolPride = () => {
  const end = Date.now() + 2000;

  const colors = ['#FF5757', '#FFD93D', '#6BCB77', '#4D96FF'];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors: colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors: colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

export const fireRocket = () => {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  const interval: NodeJS.Timeout = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti(
      Object.assign({}, defaults, {
        particleCount,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
      })
    );
    confetti(
      Object.assign({}, defaults, {
        particleCount,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
      })
    );
  }, 250);
};
