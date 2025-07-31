export enum WeatherType {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAINY = 'rainy',
  STORMY = 'stormy',
}

export interface WeatherData {
  type: WeatherType;
  waterMultiplier: number;
  growthMultiplier: number;
  duration: number;
  startTime: number;
}

export class WeatherSystem {
  private currentWeather: WeatherData;
  private weatherHistory: WeatherData[] = [];

  constructor() {
    this.currentWeather = this.generateWeather();
  }

  private generateWeather(): WeatherData {
    const types = Object.values(WeatherType);
    const randomType = types[Math.floor(Math.random() * types.length)];

    return {
      type: randomType,
      waterMultiplier: this.getWaterMultiplier(randomType),
      growthMultiplier: this.getGrowthMultiplier(randomType),
      duration: this.getDuration(randomType),
      startTime: Date.now(),
    };
  }

  private getWaterMultiplier(type: WeatherType): number {
    switch (type) {
      case WeatherType.SUNNY:
        return 1.5; // Crops lose water faster
      case WeatherType.CLOUDY:
        return 0.8; // Crops lose water slower
      case WeatherType.RAINY:
        return 0.3; // Crops lose water very slowly
      case WeatherType.STORMY:
        return 0.1; // Crops barely lose water
      default:
        return 1.0;
    }
  }

  private getGrowthMultiplier(type: WeatherType): number {
    switch (type) {
      case WeatherType.SUNNY:
        return 1.2; // Crops grow faster
      case WeatherType.CLOUDY:
        return 1.0; // Normal growth
      case WeatherType.RAINY:
        return 1.3; // Crops grow faster with rain
      case WeatherType.STORMY:
        return 0.7; // Crops grow slower in storms
      default:
        return 1.0;
    }
  }

  private getDuration(type: WeatherType): number {
    switch (type) {
      case WeatherType.SUNNY:
        return 30000; // 30 seconds
      case WeatherType.CLOUDY:
        return 45000; // 45 seconds
      case WeatherType.RAINY:
        return 60000; // 60 seconds
      case WeatherType.STORMY:
        return 20000; // 20 seconds
      default:
        return 30000;
    }
  }

  update(): void {
    const currentTime = Date.now();
    const elapsed = currentTime - this.currentWeather.startTime;

    if (elapsed >= this.currentWeather.duration) {
      // Store weather history
      this.weatherHistory.push(this.currentWeather);
      if (this.weatherHistory.length > 10) {
        this.weatherHistory.shift();
      }

      // Generate new weather
      this.currentWeather = this.generateWeather();
    }
  }

  getCurrentWeather(): WeatherData {
    return { ...this.currentWeather };
  }

  getWeatherHistory(): WeatherData[] {
    return [...this.weatherHistory];
  }

  getWeatherIcon(type: WeatherType): string {
    switch (type) {
      case WeatherType.SUNNY:
        return '☀️';
      case WeatherType.CLOUDY:
        return '☁️';
      case WeatherType.RAINY:
        return '🌧️';
      case WeatherType.STORMY:
        return '⛈️';
      default:
        return '🌤️';
    }
  }

  getWeatherName(type: WeatherType): string {
    switch (type) {
      case WeatherType.SUNNY:
        return 'Sunny';
      case WeatherType.CLOUDY:
        return 'Cloudy';
      case WeatherType.RAINY:
        return 'Rainy';
      case WeatherType.STORMY:
        return 'Stormy';
      default:
        return 'Unknown';
    }
  }

  getWeatherDescription(type: WeatherType): string {
    switch (type) {
      case WeatherType.SUNNY:
        return 'Crops grow faster but need more water';
      case WeatherType.CLOUDY:
        return 'Normal growing conditions';
      case WeatherType.RAINY:
        return 'Crops grow faster and need less water';
      case WeatherType.STORMY:
        return 'Crops grow slower but need very little water';
      default:
        return 'Unknown weather effects';
    }
  }
}
