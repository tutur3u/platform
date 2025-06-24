import confetti from 'canvas-confetti';

type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  decay?: number;
  gravity?: number;
  drift?: number;
  ticks?: number;
  angle?: number;
  origin?: {
    x?: number;
    y?: number;
  };
  colors?: string[];
  shapes?: ('square' | 'circle')[];
  scalar?: number;
  zIndex?: number;
  disableForReducedMotion?: boolean;
};

type ConfettiPreset =
  | 'basic'
  | 'celebration'
  | 'achievement'
  | 'levelUp'
  | 'reward';

export function useConfetti() {
  const fire = (options: ConfettiOptions = {}) => {
    const defaults: ConfettiOptions = {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    };

    confetti({
      ...defaults,
      ...options,
    });
  };

  const firePreset = (preset: ConfettiPreset) => {
    switch (preset) {
      case 'basic':
        fire();
        break;

      case 'celebration': {
        // Fire multiple bursts of confetti
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = {
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          zIndex: 0,
        };

        const interval = setInterval(() => {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);

          // since particles fall down, start a bit higher than random
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          });
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          });
        }, 250);
        break;
      }

      case 'achievement':
        // Golden confetti from center
        fire({
          particleCount: 150,
          spread: 100,
          colors: ['#FFD700', '#FFC800', '#E6BC00', '#FFED4A'],
          origin: { y: 0.7 },
        });
        break;

      case 'levelUp':
        // Fire confetti from left and right
        fire({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });

        fire({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
        break;

      case 'reward':
        // Shoot stars upward
        fire({
          particleCount: 100,
          startVelocity: 30,
          spread: 360,
          gravity: 0.8,
          scalar: 0.8,
          drift: 0,
          ticks: 60,
          shapes: ['circle'],
          colors: [
            '#FF0000',
            '#00FF00',
            '#0000FF',
            '#FFFF00',
            '#FF00FF',
            '#00FFFF',
          ],
        });
        break;
    }
  };

  const fireworks = () => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50;

      confetti({
        particleCount,
        angle: randomInRange(55, 125),
        spread: randomInRange(50, 70),
        origin: { x: randomInRange(0.1, 0.9), y: randomInRange(0.1, 0.5) },
        colors: [
          '#FF0000',
          '#00FF00',
          '#0000FF',
          '#FFFF00',
          '#FF00FF',
          '#00FFFF',
        ],
        startVelocity: randomInRange(25, 45),
        gravity: 1.2,
        drift: randomInRange(-0.4, 0.4),
        ticks: 60,
      });
    }, 250);
  };

  const schoolPride = () => {
    const end = Date.now() + 5 * 1000;

    // go Buckeyes!
    const colors = ['#bb0000', '#ffffff'];

    (function frame() {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  return {
    fire,
    firePreset,
    fireworks,
    schoolPride,
  };
}
