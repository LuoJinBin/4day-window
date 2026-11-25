import config from '../server/config.js';
import { createPlannerService } from '../server/planner-service.js';
import { createGeocodingHandler } from '../server/vercel-handlers.js';

export default createGeocodingHandler(createPlannerService(config));
