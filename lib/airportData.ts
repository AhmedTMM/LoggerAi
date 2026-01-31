// Airport coordinates database for flight map visualization
// Includes major US airports and common GA airports

export interface AirportCoordinates {
  lat: number;
  lng: number;
  name: string;
  city?: string;
}

// Common US airports with coordinates
export const airportDatabase: Record<string, AirportCoordinates> = {
  // Major Hubs
  'KJFK': { lat: 40.6413, lng: -73.7781, name: 'John F. Kennedy International', city: 'New York' },
  'KLAX': { lat: 33.9425, lng: -118.4081, name: 'Los Angeles International', city: 'Los Angeles' },
  'KORD': { lat: 41.9742, lng: -87.9073, name: "O'Hare International", city: 'Chicago' },
  'KATL': { lat: 33.6407, lng: -84.4277, name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta' },
  'KDFW': { lat: 32.8998, lng: -97.0403, name: 'Dallas/Fort Worth International', city: 'Dallas' },
  'KDEN': { lat: 39.8561, lng: -104.6737, name: 'Denver International', city: 'Denver' },
  'KSFO': { lat: 37.6213, lng: -122.3790, name: 'San Francisco International', city: 'San Francisco' },
  'KSEA': { lat: 47.4502, lng: -122.3088, name: 'Seattle-Tacoma International', city: 'Seattle' },
  'KLAS': { lat: 36.0840, lng: -115.1537, name: 'Harry Reid International', city: 'Las Vegas' },
  'KMCO': { lat: 28.4312, lng: -81.3081, name: 'Orlando International', city: 'Orlando' },
  'KMIA': { lat: 25.7959, lng: -80.2870, name: 'Miami International', city: 'Miami' },
  'KPHX': { lat: 33.4373, lng: -112.0078, name: 'Phoenix Sky Harbor International', city: 'Phoenix' },
  'KBOS': { lat: 42.3656, lng: -71.0096, name: 'Boston Logan International', city: 'Boston' },
  'KEWR': { lat: 40.6895, lng: -74.1745, name: 'Newark Liberty International', city: 'Newark' },
  'KLGA': { lat: 40.7769, lng: -73.8740, name: 'LaGuardia', city: 'New York' },
  'KIAD': { lat: 38.9531, lng: -77.4565, name: 'Washington Dulles International', city: 'Washington' },
  'KDCA': { lat: 38.8512, lng: -77.0402, name: 'Ronald Reagan Washington National', city: 'Washington' },
  'KSAN': { lat: 32.7338, lng: -117.1933, name: 'San Diego International', city: 'San Diego' },
  'KTPA': { lat: 27.9755, lng: -82.5332, name: 'Tampa International', city: 'Tampa' },
  'KPDX': { lat: 45.5898, lng: -122.5951, name: 'Portland International', city: 'Portland' },
  'KSTL': { lat: 38.7487, lng: -90.3700, name: 'St. Louis Lambert International', city: 'St. Louis' },
  'KMSP': { lat: 44.8848, lng: -93.2223, name: 'Minneapolis-St. Paul International', city: 'Minneapolis' },
  'KDTW': { lat: 42.2162, lng: -83.3554, name: 'Detroit Metropolitan', city: 'Detroit' },
  'KPHL': { lat: 39.8729, lng: -75.2437, name: 'Philadelphia International', city: 'Philadelphia' },
  'KCLT': { lat: 35.2140, lng: -80.9431, name: 'Charlotte Douglas International', city: 'Charlotte' },
  'KBWI': { lat: 39.1774, lng: -76.6684, name: 'Baltimore/Washington International', city: 'Baltimore' },
  'KSLC': { lat: 40.7884, lng: -111.9778, name: 'Salt Lake City International', city: 'Salt Lake City' },
  'KAUS': { lat: 30.1945, lng: -97.6699, name: 'Austin-Bergstrom International', city: 'Austin' },
  'KHOU': { lat: 29.6454, lng: -95.2789, name: 'William P. Hobby', city: 'Houston' },
  'KIAH': { lat: 29.9844, lng: -95.3414, name: 'George Bush Intercontinental', city: 'Houston' },
  'KBNA': { lat: 36.1263, lng: -86.6774, name: 'Nashville International', city: 'Nashville' },
  'KRDU': { lat: 35.8801, lng: -78.7875, name: 'Raleigh-Durham International', city: 'Raleigh' },
  'KOAK': { lat: 37.7213, lng: -122.2208, name: 'Oakland International', city: 'Oakland' },
  'KSJC': { lat: 37.3626, lng: -121.9291, name: 'San Jose International', city: 'San Jose' },
  'KCLE': { lat: 41.4117, lng: -81.8498, name: 'Cleveland Hopkins International', city: 'Cleveland' },
  'KCMH': { lat: 39.9980, lng: -82.8919, name: 'John Glenn Columbus International', city: 'Columbus' },
  'KIND': { lat: 39.7173, lng: -86.2944, name: 'Indianapolis International', city: 'Indianapolis' },
  'KMCI': { lat: 39.2976, lng: -94.7139, name: 'Kansas City International', city: 'Kansas City' },
  'KPIT': { lat: 40.4915, lng: -80.2329, name: 'Pittsburgh International', city: 'Pittsburgh' },
  'KSNA': { lat: 33.6757, lng: -117.8682, name: 'John Wayne Airport', city: 'Santa Ana' },
  'KFLL': { lat: 26.0726, lng: -80.1527, name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale' },

  // Popular GA Airports
  'KVNY': { lat: 34.2098, lng: -118.4890, name: 'Van Nuys', city: 'Van Nuys' },
  'KSMO': { lat: 34.0158, lng: -118.4513, name: 'Santa Monica Municipal', city: 'Santa Monica' },
  'KPAO': { lat: 37.4611, lng: -122.1150, name: 'Palo Alto', city: 'Palo Alto' },
  'KSQL': { lat: 37.5119, lng: -122.2494, name: 'San Carlos', city: 'San Carlos' },
  'KHWD': { lat: 37.6591, lng: -122.1217, name: 'Hayward Executive', city: 'Hayward' },
  'KCCR': { lat: 37.9897, lng: -122.0569, name: 'Buchanan Field', city: 'Concord' },
  'KRHV': { lat: 37.3327, lng: -121.8197, name: 'Reid-Hillview', city: 'San Jose' },
  'KTOA': { lat: 33.8034, lng: -118.3396, name: 'Zamperini Field', city: 'Torrance' },
  'KHHR': { lat: 33.9228, lng: -118.3350, name: 'Hawthorne Municipal', city: 'Hawthorne' },
  'KFUL': { lat: 33.8720, lng: -117.9795, name: 'Fullerton Municipal', city: 'Fullerton' },
  'KCDW': { lat: 40.8752, lng: -74.2814, name: 'Essex County', city: 'Caldwell' },
  'KTEB': { lat: 40.8501, lng: -74.0608, name: 'Teterboro', city: 'Teterboro' },
  'KFRG': { lat: 40.7288, lng: -73.4134, name: 'Republic', city: 'Farmingdale' },
  'KISP': { lat: 40.7952, lng: -73.1002, name: 'Long Island MacArthur', city: 'Islip' },
  'KHPN': { lat: 41.0670, lng: -73.7076, name: 'Westchester County', city: 'White Plains' },
  'KPWK': { lat: 42.1143, lng: -87.9015, name: 'Chicago Executive', city: 'Wheeling' },
  'KDPA': { lat: 41.9078, lng: -88.2486, name: 'DuPage', city: 'West Chicago' },
  'KARR': { lat: 41.7715, lng: -88.4757, name: 'Aurora Municipal', city: 'Aurora' },
  'KAPA': { lat: 39.5700, lng: -104.8493, name: 'Centennial', city: 'Englewood' },
  'KBJC': { lat: 39.9088, lng: -105.1173, name: 'Rocky Mountain Metropolitan', city: 'Broomfield' },
  'KFTG': { lat: 39.7853, lng: -104.5433, name: 'Front Range', city: 'Watkins' },
  'KADS': { lat: 32.9686, lng: -96.8364, name: 'Addison', city: 'Addison' },
  'KFWS': { lat: 32.5687, lng: -97.3181, name: 'Fort Worth Spinks', city: 'Fort Worth' },
  'KGKY': { lat: 32.6637, lng: -97.0943, name: 'Arlington Municipal', city: 'Arlington' },
  'KSGR': { lat: 29.6223, lng: -95.6565, name: 'Sugar Land Regional', city: 'Sugar Land' },
  'KDWH': { lat: 30.0618, lng: -95.5526, name: 'David Wayne Hooks Memorial', city: 'Spring' },
  'KELP': { lat: 31.8069, lng: -106.3778, name: 'El Paso International', city: 'El Paso' },
  'KABQ': { lat: 35.0402, lng: -106.6094, name: 'Albuquerque International Sunport', city: 'Albuquerque' },
  'KSDL': { lat: 33.6229, lng: -111.9105, name: 'Scottsdale', city: 'Scottsdale' },
  'KDVT': { lat: 33.6883, lng: -112.0825, name: 'Phoenix Deer Valley', city: 'Phoenix' },
  'KIWA': { lat: 33.3078, lng: -111.6556, name: 'Phoenix-Mesa Gateway', city: 'Mesa' },
  'KFFZ': { lat: 33.4608, lng: -111.7282, name: 'Falcon Field', city: 'Mesa' },
  'KHND': { lat: 35.9728, lng: -115.1344, name: 'Henderson Executive', city: 'Henderson' },
  'KVGT': { lat: 36.2107, lng: -115.1944, name: 'North Las Vegas', city: 'North Las Vegas' },
  'KCRQ': { lat: 33.1283, lng: -117.2802, name: 'McClellan-Palomar', city: 'Carlsbad' },
  'KMYF': { lat: 32.8157, lng: -117.1395, name: 'Montgomery-Gibbs Executive', city: 'San Diego' },
  'KSEE': { lat: 32.8262, lng: -116.9725, name: 'Gillespie Field', city: 'El Cajon' },
  'KOPF': { lat: 25.9070, lng: -80.2784, name: 'Miami Opa-locka Executive', city: 'Opa-locka' },
  'KTMB': { lat: 25.6479, lng: -80.4328, name: 'Miami Executive', city: 'Kendall' },
  'KFXE': { lat: 26.1972, lng: -80.1707, name: 'Fort Lauderdale Executive', city: 'Fort Lauderdale' },
  'KPBI': { lat: 26.6832, lng: -80.0956, name: 'Palm Beach International', city: 'West Palm Beach' },
  'KPDK': { lat: 33.8756, lng: -84.3020, name: 'DeKalb-Peachtree', city: 'Atlanta' },
  'KFTY': { lat: 33.7791, lng: -84.5214, name: 'Fulton County', city: 'Atlanta' },
  'KHEF': { lat: 38.7214, lng: -77.5156, name: 'Manassas Regional', city: 'Manassas' },
  'KJYO': { lat: 39.0780, lng: -77.5575, name: 'Leesburg Executive', city: 'Leesburg' },
  'KGAI': { lat: 39.1683, lng: -77.1660, name: 'Montgomery County Airpark', city: 'Gaithersburg' },
  'KBED': { lat: 42.4700, lng: -71.2890, name: 'Laurence G. Hanscom Field', city: 'Bedford' },
  'KOWD': { lat: 42.1904, lng: -71.1734, name: 'Norwood Memorial', city: 'Norwood' },
  'KPYM': { lat: 41.9090, lng: -70.7288, name: 'Plymouth Municipal', city: 'Plymouth' },
  'KOSH': { lat: 43.9844, lng: -88.5570, name: 'Wittman Regional', city: 'Oshkosh' },
  'KFDK': { lat: 39.4176, lng: -77.3743, name: 'Frederick Municipal', city: 'Frederick' },
  'KMTN': { lat: 39.3257, lng: -76.4138, name: 'Martin State', city: 'Baltimore' },

  // International (common destinations)
  'CYYZ': { lat: 43.6777, lng: -79.6248, name: 'Toronto Pearson International', city: 'Toronto' },
  'CYVR': { lat: 49.1947, lng: -123.1839, name: 'Vancouver International', city: 'Vancouver' },
  'CYUL': { lat: 45.4706, lng: -73.7408, name: 'Montreal-Trudeau International', city: 'Montreal' },
  'CYOW': { lat: 45.3225, lng: -75.6692, name: 'Ottawa International', city: 'Ottawa' },
  'MMMX': { lat: 19.4363, lng: -99.0721, name: 'Mexico City International', city: 'Mexico City' },
  'MMUN': { lat: 21.0365, lng: -86.8771, name: 'Cancun International', city: 'Cancun' },
  'TNCM': { lat: 18.0410, lng: -63.1089, name: 'Princess Juliana International', city: 'St. Maarten' },
  'MKJS': { lat: 18.5037, lng: -77.9133, name: 'Sangster International', city: 'Montego Bay' },
  'MYNN': { lat: 25.0390, lng: -77.4662, name: 'Nassau International', city: 'Nassau' },
};

// Get coordinates for an airport code
export function getAirportCoordinates(code: string): AirportCoordinates | null {
  // Normalize the code (uppercase, handle both with and without K prefix for US airports)
  const normalizedCode = code.toUpperCase().trim();

  // Try exact match first
  if (airportDatabase[normalizedCode]) {
    return airportDatabase[normalizedCode];
  }

  // If it's a 3-letter code, try adding K prefix (common US convention)
  if (normalizedCode.length === 3) {
    const withK = `K${normalizedCode}`;
    if (airportDatabase[withK]) {
      return airportDatabase[withK];
    }
  }

  // If it starts with K and is 4 letters, try without K
  if (normalizedCode.startsWith('K') && normalizedCode.length === 4) {
    const withoutK = normalizedCode.slice(1);
    // We already checked the full code, so just return null
  }

  return null;
}

// Generate a pseudo-random position for unknown airports (for demo purposes)
// In production, you'd want to use an airport database API
export function getApproximatePosition(code: string): AirportCoordinates {
  // Generate a deterministic but seemingly random position based on the code
  // This ensures the same airport always appears in the same place
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
    hash = hash & hash;
  }

  // Generate position somewhere in continental US
  const lat = 25 + (Math.abs(hash % 20000) / 1000); // 25 to 45 latitude
  const lng = -125 + (Math.abs((hash >> 8) % 50000) / 1000); // -125 to -75 longitude

  return {
    lat,
    lng,
    name: code,
    city: 'Unknown'
  };
}
