import appConfig from '../server/config.js';
import { createForecastService } from '../server/forecast-service.js';
import { createForecastHandler } from '../server/vercel-handlers.js';

// Vercel functions have an ephemeral, writable /tmp directory. Keep a warm-instance
// cache there; the service also keeps its latest result in module memory.
const runtimeConfig = {
  ...appConfig,
  cacheFile: '/tmp/gz-weather-forecast.json'
};
const service = createForecastService(runtimeConfig);

export default createForecastHandler(service, {
  allowForceRefresh: process.env.ALLOW_FORCE_REFRESH === 'true'
});
