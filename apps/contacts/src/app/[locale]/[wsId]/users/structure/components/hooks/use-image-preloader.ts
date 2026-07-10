import { useCallback, useEffect, useState } from 'react';
import type { Person } from '../../types';

interface UseImagePreloaderReturn {
  images: Record<string, HTMLImageElement>;
  loading: boolean;
  errors: Record<string, Error>;
}

/**
 * Custom hook for preloading profile images
 * Efficiently handles image loading with error states and loading indicators
 */
export function useImagePreloader(people: Person[]): UseImagePreloaderReturn {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, Error>>({});

  const preloadImages = useCallback(() => {
    if (people.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrors({});

    let loadedCount = 0;
    const totalImages = people.length;
    const newImages: Record<string, HTMLImageElement> = {};
    const newErrors: Record<string, Error> = {};

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount === totalImages) {
        setImages(newImages);
        setErrors(newErrors);
        setLoading(false);
      }
    };

    people.forEach((person) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Handle CORS if needed

      img.onload = () => {
        newImages[person.id] = img;
        checkComplete();
      };

      img.onerror = () => {
        newErrors[person.id] = new Error(
          `Failed to load image for ${person.fullName}`
        );
        checkComplete();
      };

      img.src = person.photoUrl;
    });
  }, [people]);

  useEffect(() => {
    preloadImages();
  }, [preloadImages]);

  return { images, loading, errors };
}
