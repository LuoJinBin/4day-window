import { searchCities } from '../server/geocode.js';
import { createGeocodeHandler } from '../server/vercel-handlers.js';

export default createGeocodeHandler(searchCities);
