import appConfig from '../server/config.js';
import { createForecastService } from '../server/forecast-service.js';
import { createForecastHandler } from '../server/vercel-handlers.js';
import { parseForecastLocation } from '../server/location.js';

const services = new Map();
function serviceForUrl(url) {
  const parsed = parseForecastLocation(url, appConfig, { cacheDir: '/tmp' });
  if (parsed.key === 'default') {
    if (!services.has('default')) {
      services.set('default', createForecastService({
        ...appConfig,
        cacheFile: '/tmp/gz-weather-forecast-default.json'
      }));
    }
    return services.get('default');
  }
  if (!services.has(parsed.key)) services.set(parsed.key, createForecastService(parsed.config));
  return services.get(parsed.key);
}

export default createForecastHandler(serviceForUrl, {
  allowForceRefresh: process.env.ALLOW_FORCE_REFRESH === 'true'
});
