import type { WeatherSystem } from '../engine/weather';

interface WeatherDisplayProps {
  weather: WeatherSystem;
}

export function WeatherDisplay({ weather }: WeatherDisplayProps) {
  const currentWeather = weather.getCurrentWeather();
  const timeRemaining = Math.max(
    0,
    currentWeather.duration - (Date.now() - currentWeather.startTime)
  );
  const progress = 1 - timeRemaining / currentWeather.duration;

  return (
    <div className="rounded-lg border border-dynamic-gray/20 bg-dynamic-gray/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {weather.getWeatherIcon(currentWeather.type)}
          </span>
          <div>
            <div className="font-semibold text-sm">
              {weather.getWeatherName(currentWeather.type)}
            </div>
            <div className="text-dynamic-gray/70 text-xs">
              {weather.getWeatherDescription(currentWeather.type)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-dynamic-gray/70 text-xs">Time Left</div>
          <div className="font-semibold text-sm">
            {Math.ceil(timeRemaining / 1000)}s
          </div>
        </div>
      </div>

      {/* Weather Progress Bar */}
      <div className="mb-2">
        <div className="h-2 overflow-hidden rounded-full bg-dynamic-gray/20">
          <div
            className="h-full bg-gradient-to-r from-dynamic-blue to-dynamic-purple transition-all duration-1000"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Weather Effects */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-dynamic-gray/70">Growth:</span>
          <span
            className={`font-semibold ${
              currentWeather.growthMultiplier > 1
                ? 'text-dynamic-green'
                : currentWeather.growthMultiplier < 1
                  ? 'text-dynamic-red'
                  : 'text-dynamic-gray'
            }`}
          >
            {currentWeather.growthMultiplier > 1 ? '+' : ''}
            {Math.round((currentWeather.growthMultiplier - 1) * 100)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-dynamic-gray/70">Water:</span>
          <span
            className={`font-semibold ${
              currentWeather.waterMultiplier > 1
                ? 'text-dynamic-red'
                : currentWeather.waterMultiplier < 1
                  ? 'text-dynamic-green'
                  : 'text-dynamic-gray'
            }`}
          >
            {currentWeather.waterMultiplier > 1 ? '+' : ''}
            {Math.round((currentWeather.waterMultiplier - 1) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
