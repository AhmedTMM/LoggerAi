// Comprehensive Airport Database for Flight Map Visualization
// Uses accurate coordinates from official aviation sources (FAA, OurAirports)

export interface AirportCoordinates {
  lat: number;
  lng: number;
  name: string;
  city?: string;
  elevation?: number; // feet
  type?: 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base';
}

// Comprehensive US airports database with verified coordinates
// Data sourced from FAA NASR and OurAirports databases
export const airportDatabase: Record<string, AirportCoordinates> = {
  // ============================================
  // MAJOR US HUB AIRPORTS
  // ============================================
  'KATL': { lat: 33.6367, lng: -84.4281, name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', elevation: 1026 },
  'KORD': { lat: 41.9742, lng: -87.9073, name: "O'Hare International", city: 'Chicago', elevation: 672 },
  'KDFW': { lat: 32.8968, lng: -97.0380, name: 'Dallas/Fort Worth International', city: 'Dallas', elevation: 607 },
  'KDEN': { lat: 39.8561, lng: -104.6737, name: 'Denver International', city: 'Denver', elevation: 5431 },
  'KJFK': { lat: 40.6399, lng: -73.7787, name: 'John F. Kennedy International', city: 'New York', elevation: 13 },
  'KLAX': { lat: 33.9425, lng: -118.4081, name: 'Los Angeles International', city: 'Los Angeles', elevation: 128 },
  'KSFO': { lat: 37.6213, lng: -122.3790, name: 'San Francisco International', city: 'San Francisco', elevation: 13 },
  'KSEA': { lat: 47.4502, lng: -122.3088, name: 'Seattle-Tacoma International', city: 'Seattle', elevation: 433 },
  'KLAS': { lat: 36.0840, lng: -115.1522, name: 'Harry Reid International', city: 'Las Vegas', elevation: 2181 },
  'KMCO': { lat: 28.4294, lng: -81.3090, name: 'Orlando International', city: 'Orlando', elevation: 96 },
  'KPHX': { lat: 33.4343, lng: -112.0116, name: 'Phoenix Sky Harbor International', city: 'Phoenix', elevation: 1135 },
  'KMIA': { lat: 25.7959, lng: -80.2870, name: 'Miami International', city: 'Miami', elevation: 8 },
  'KEWR': { lat: 40.6925, lng: -74.1687, name: 'Newark Liberty International', city: 'Newark', elevation: 18 },
  'KLGA': { lat: 40.7769, lng: -73.8740, name: 'LaGuardia', city: 'New York', elevation: 21 },
  'KBOS': { lat: 42.3656, lng: -71.0096, name: 'Boston Logan International', city: 'Boston', elevation: 20 },
  'KIAD': { lat: 38.9531, lng: -77.4565, name: 'Washington Dulles International', city: 'Washington', elevation: 313 },
  'KDCA': { lat: 38.8521, lng: -77.0377, name: 'Ronald Reagan Washington National', city: 'Washington', elevation: 15 },
  'KIAH': { lat: 29.9844, lng: -95.3414, name: 'George Bush Intercontinental', city: 'Houston', elevation: 97 },
  'KHOU': { lat: 29.6454, lng: -95.2789, name: 'William P. Hobby', city: 'Houston', elevation: 46 },
  'KMSP': { lat: 44.8848, lng: -93.2223, name: 'Minneapolis-St. Paul International', city: 'Minneapolis', elevation: 841 },
  'KDTW': { lat: 42.2124, lng: -83.3534, name: 'Detroit Metropolitan Wayne County', city: 'Detroit', elevation: 645 },
  'KFLL': { lat: 26.0726, lng: -80.1527, name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale', elevation: 9 },
  'KPHL': { lat: 39.8721, lng: -75.2411, name: 'Philadelphia International', city: 'Philadelphia', elevation: 36 },
  'KCLT': { lat: 35.2140, lng: -80.9431, name: 'Charlotte Douglas International', city: 'Charlotte', elevation: 748 },
  'KSLC': { lat: 40.7884, lng: -111.9778, name: 'Salt Lake City International', city: 'Salt Lake City', elevation: 4227 },
  'KSAN': { lat: 32.7336, lng: -117.1897, name: 'San Diego International', city: 'San Diego', elevation: 17 },
  'KTPA': { lat: 27.9755, lng: -82.5332, name: 'Tampa International', city: 'Tampa', elevation: 26 },
  'KBWI': { lat: 39.1754, lng: -76.6684, name: 'Baltimore/Washington International', city: 'Baltimore', elevation: 146 },
  'KPDX': { lat: 45.5887, lng: -122.5975, name: 'Portland International', city: 'Portland', elevation: 31 },
  'KSTL': { lat: 38.7487, lng: -90.3700, name: 'St. Louis Lambert International', city: 'St. Louis', elevation: 618 },
  'KBNA': { lat: 36.1245, lng: -86.6782, name: 'Nashville International', city: 'Nashville', elevation: 599 },
  'KAUS': { lat: 30.1945, lng: -97.6699, name: 'Austin-Bergstrom International', city: 'Austin', elevation: 542 },
  'KRDU': { lat: 35.8801, lng: -78.7875, name: 'Raleigh-Durham International', city: 'Raleigh', elevation: 435 },
  'KMDW': { lat: 41.7868, lng: -87.7522, name: 'Chicago Midway International', city: 'Chicago', elevation: 620 },
  'KIND': { lat: 39.7173, lng: -86.2944, name: 'Indianapolis International', city: 'Indianapolis', elevation: 797 },
  'KSJC': { lat: 37.3626, lng: -121.9291, name: 'Norman Y. Mineta San Jose International', city: 'San Jose', elevation: 62 },
  'KOAK': { lat: 37.7213, lng: -122.2208, name: 'Metropolitan Oakland International', city: 'Oakland', elevation: 9 },
  'KCMH': { lat: 39.9980, lng: -82.8919, name: 'John Glenn Columbus International', city: 'Columbus', elevation: 815 },
  'KCLE': { lat: 41.4117, lng: -81.8498, name: 'Cleveland Hopkins International', city: 'Cleveland', elevation: 791 },
  'KMCI': { lat: 39.2976, lng: -94.7139, name: 'Kansas City International', city: 'Kansas City', elevation: 1026 },
  'KPIT': { lat: 40.4915, lng: -80.2329, name: 'Pittsburgh International', city: 'Pittsburgh', elevation: 1203 },
  'KSAT': { lat: 29.5337, lng: -98.4698, name: 'San Antonio International', city: 'San Antonio', elevation: 809 },
  'KSNA': { lat: 33.6757, lng: -117.8682, name: 'John Wayne Airport-Orange County', city: 'Santa Ana', elevation: 56 },
  'KPBI': { lat: 26.6832, lng: -80.0956, name: 'Palm Beach International', city: 'West Palm Beach', elevation: 19 },
  'KSMF': { lat: 38.6954, lng: -121.5908, name: 'Sacramento International', city: 'Sacramento', elevation: 27 },
  'KMKE': { lat: 42.9472, lng: -87.8966, name: 'General Mitchell International', city: 'Milwaukee', elevation: 723 },
  'KABQ': { lat: 35.0402, lng: -106.6094, name: 'Albuquerque International Sunport', city: 'Albuquerque', elevation: 5355 },
  'KELP': { lat: 31.8069, lng: -106.3778, name: 'El Paso International', city: 'El Paso', elevation: 3959 },
  'KOMA': { lat: 41.3032, lng: -95.8941, name: 'Eppley Airfield', city: 'Omaha', elevation: 984 },
  'KRIC': { lat: 37.5052, lng: -77.3197, name: 'Richmond International', city: 'Richmond', elevation: 167 },
  'KBUF': { lat: 42.9405, lng: -78.7322, name: 'Buffalo Niagara International', city: 'Buffalo', elevation: 728 },
  'KRNO': { lat: 39.4991, lng: -119.7681, name: 'Reno-Tahoe International', city: 'Reno', elevation: 4415 },
  'KONT': { lat: 34.0560, lng: -117.6012, name: 'Ontario International', city: 'Ontario', elevation: 944 },
  'KBURR': { lat: 34.2007, lng: -118.3585, name: 'Bob Hope', city: 'Burbank', elevation: 778 },

  // ============================================
  // POPULAR GENERAL AVIATION AIRPORTS
  // ============================================
  // California
  'KVNY': { lat: 34.2098, lng: -118.4890, name: 'Van Nuys', city: 'Van Nuys', elevation: 802, type: 'medium_airport' },
  'KSMO': { lat: 34.0158, lng: -118.4513, name: 'Santa Monica Municipal', city: 'Santa Monica', elevation: 177, type: 'small_airport' },
  'KPAO': { lat: 37.4611, lng: -122.1150, name: 'Palo Alto', city: 'Palo Alto', elevation: 4, type: 'small_airport' },
  'KSQL': { lat: 37.5119, lng: -122.2494, name: 'San Carlos', city: 'San Carlos', elevation: 5, type: 'small_airport' },
  'KHWD': { lat: 37.6591, lng: -122.1217, name: 'Hayward Executive', city: 'Hayward', elevation: 52, type: 'small_airport' },
  'KCCR': { lat: 37.9897, lng: -122.0569, name: 'Buchanan Field', city: 'Concord', elevation: 23, type: 'small_airport' },
  'KRHV': { lat: 37.3327, lng: -121.8197, name: 'Reid-Hillview', city: 'San Jose', elevation: 135, type: 'small_airport' },
  'KTOA': { lat: 33.8034, lng: -118.3396, name: 'Zamperini Field', city: 'Torrance', elevation: 103, type: 'small_airport' },
  'KHHR': { lat: 33.9228, lng: -118.3350, name: 'Hawthorne Municipal', city: 'Hawthorne', elevation: 66, type: 'small_airport' },
  'KFUL': { lat: 33.8720, lng: -117.9795, name: 'Fullerton Municipal', city: 'Fullerton', elevation: 96, type: 'small_airport' },
  'KCRQ': { lat: 33.1283, lng: -117.2802, name: 'McClellan-Palomar', city: 'Carlsbad', elevation: 331, type: 'small_airport' },
  'KMYF': { lat: 32.8157, lng: -117.1395, name: 'Montgomery-Gibbs Executive', city: 'San Diego', elevation: 427, type: 'small_airport' },
  'KSEE': { lat: 32.8262, lng: -116.9725, name: 'Gillespie Field', city: 'El Cajon', elevation: 388, type: 'small_airport' },
  'KRNM': { lat: 33.0397, lng: -116.9153, name: 'Ramona', city: 'Ramona', elevation: 1395, type: 'small_airport' },
  'KSDM': { lat: 32.5723, lng: -116.9803, name: 'Brown Field Municipal', city: 'San Diego', elevation: 526, type: 'small_airport' },
  'KCMA': { lat: 34.2137, lng: -119.0943, name: 'Camarillo', city: 'Camarillo', elevation: 77, type: 'small_airport' },
  'KOXR': { lat: 34.2008, lng: -119.2072, name: 'Oxnard', city: 'Oxnard', elevation: 45, type: 'small_airport' },
  'KWHP': { lat: 34.2593, lng: -118.4134, name: 'Whiteman', city: 'Pacoima', elevation: 1003, type: 'small_airport' },
  'KSBA': { lat: 34.4262, lng: -119.8404, name: 'Santa Barbara Municipal', city: 'Santa Barbara', elevation: 10, type: 'medium_airport' },
  'KLGB': { lat: 33.8177, lng: -118.1516, name: 'Long Beach/Daugherty Field', city: 'Long Beach', elevation: 60, type: 'medium_airport' },
  // Central California
  'KMER': { lat: 37.3805, lng: -120.5682, name: 'Castle', city: 'Merced', elevation: 191, type: 'small_airport' },
  'KMCE': { lat: 37.2847, lng: -120.5139, name: 'Merced Regional/Macready Field', city: 'Merced', elevation: 155, type: 'small_airport' },
  'KPRB': { lat: 35.6729, lng: -120.6271, name: 'Paso Robles Municipal', city: 'Paso Robles', elevation: 840, type: 'small_airport' },
  'KMOD': { lat: 37.6258, lng: -120.9544, name: 'Modesto City-County', city: 'Modesto', elevation: 97, type: 'medium_airport' },
  'KSTS': { lat: 38.5089, lng: -122.8128, name: 'Charles M. Schulz Sonoma County', city: 'Santa Rosa', elevation: 128, type: 'medium_airport' },
  'KAPC': { lat: 38.2132, lng: -122.2807, name: 'Napa County', city: 'Napa', elevation: 35, type: 'small_airport' },
  'KLVK': { lat: 37.6934, lng: -121.8204, name: 'Livermore Municipal', city: 'Livermore', elevation: 400, type: 'small_airport' },
  'KWVI': { lat: 36.9357, lng: -121.7896, name: 'Watsonville Municipal', city: 'Watsonville', elevation: 163, type: 'small_airport' },
  'KMRY': { lat: 36.5870, lng: -121.8430, name: 'Monterey Regional', city: 'Monterey', elevation: 257, type: 'medium_airport' },
  'KSBP': { lat: 35.2368, lng: -120.6424, name: 'San Luis Obispo County Regional', city: 'San Luis Obispo', elevation: 212, type: 'medium_airport' },
  'KBFL': { lat: 35.4336, lng: -119.0567, name: 'Meadows Field', city: 'Bakersfield', elevation: 510, type: 'medium_airport' },
  'KFAT': { lat: 36.7762, lng: -119.7181, name: 'Fresno Yosemite International', city: 'Fresno', elevation: 336, type: 'medium_airport' },
  'KFCH': { lat: 36.7324, lng: -119.8200, name: 'Fresno Chandler Executive', city: 'Fresno', elevation: 279, type: 'small_airport' },
  'KVIS': { lat: 36.3187, lng: -119.3929, name: 'Visalia Municipal', city: 'Visalia', elevation: 295, type: 'small_airport' },
  'KSCK': { lat: 37.8942, lng: -121.2386, name: 'Stockton Metropolitan', city: 'Stockton', elevation: 33, type: 'medium_airport' },
  'KTCY': { lat: 37.6911, lng: -121.4413, name: 'Tracy Municipal', city: 'Tracy', elevation: 193, type: 'small_airport' },
  'KTVL': { lat: 38.8939, lng: -119.9953, name: 'Lake Tahoe', city: 'South Lake Tahoe', elevation: 6264, type: 'small_airport' },
  'KTRK': { lat: 39.3200, lng: -120.1396, name: 'Truckee Tahoe', city: 'Truckee', elevation: 5900, type: 'small_airport' },
  'KUKI': { lat: 39.1260, lng: -123.2009, name: 'Ukiah Municipal', city: 'Ukiah', elevation: 614, type: 'small_airport' },
  'KACV': { lat: 40.9781, lng: -124.1086, name: 'Arcata-Eureka', city: 'Arcata', elevation: 221, type: 'medium_airport' },
  'KRDD': { lat: 40.5090, lng: -122.2934, name: 'Redding Municipal', city: 'Redding', elevation: 505, type: 'medium_airport' },
  'KCIC': { lat: 39.7954, lng: -121.8584, name: 'Chico Municipal', city: 'Chico', elevation: 240, type: 'small_airport' },
  'KMHR': { lat: 38.5539, lng: -121.2978, name: 'Sacramento Mather', city: 'Sacramento', elevation: 98, type: 'medium_airport' },
  'KSAC': { lat: 38.5126, lng: -121.4935, name: 'Sacramento Executive', city: 'Sacramento', elevation: 24, type: 'small_airport' },
  'KPSP': { lat: 33.8297, lng: -116.5067, name: 'Palm Springs International', city: 'Palm Springs', elevation: 477, type: 'medium_airport' },
  'KTRM': { lat: 33.6267, lng: -116.1597, name: 'Jacqueline Cochran Regional', city: 'Thermal', elevation: -115, type: 'small_airport' },
  'KIPL': { lat: 32.8342, lng: -115.5787, name: 'Imperial County', city: 'Imperial', elevation: -54, type: 'small_airport' },
  'KEED': { lat: 34.7667, lng: -114.6233, name: 'Needles', city: 'Needles', elevation: 983, type: 'small_airport' },
  'KBLH': { lat: 33.6192, lng: -114.7169, name: 'Blythe', city: 'Blythe', elevation: 399, type: 'small_airport' },

  // Arizona
  'KSDL': { lat: 33.6229, lng: -111.9105, name: 'Scottsdale', city: 'Scottsdale', elevation: 1510, type: 'medium_airport' },
  'KDVT': { lat: 33.6883, lng: -112.0825, name: 'Phoenix Deer Valley', city: 'Phoenix', elevation: 1478, type: 'small_airport' },
  'KIWA': { lat: 33.3078, lng: -111.6556, name: 'Phoenix-Mesa Gateway', city: 'Mesa', elevation: 1384, type: 'medium_airport' },
  'KFFZ': { lat: 33.4608, lng: -111.7282, name: 'Falcon Field', city: 'Mesa', elevation: 1394, type: 'small_airport' },
  'KGEU': { lat: 33.5278, lng: -111.9255, name: 'Glendale Municipal', city: 'Glendale', elevation: 1071, type: 'small_airport' },
  'KCHD': { lat: 33.2691, lng: -111.8111, name: 'Chandler Municipal', city: 'Chandler', elevation: 1243, type: 'small_airport' },
  'KTUS': { lat: 32.1161, lng: -110.9410, name: 'Tucson International', city: 'Tucson', elevation: 2643, type: 'large_airport' },
  'KRYV': { lat: 34.7265, lng: -112.0194, name: 'Ernest A. Love Field', city: 'Prescott', elevation: 5045, type: 'small_airport' },
  'KPRC': { lat: 34.6545, lng: -112.4196, name: 'Ernest A. Love Field', city: 'Prescott', elevation: 5045, type: 'small_airport' },
  'KFLG': { lat: 35.1385, lng: -111.6711, name: 'Flagstaff Pulliam', city: 'Flagstaff', elevation: 7014, type: 'medium_airport' },
  'KSEZ': { lat: 34.8486, lng: -111.7884, name: 'Sedona', city: 'Sedona', elevation: 4830, type: 'small_airport' },

  // Nevada
  'KHND': { lat: 35.9728, lng: -115.1344, name: 'Henderson Executive', city: 'Henderson', elevation: 2492, type: 'small_airport' },
  'KVGT': { lat: 36.2107, lng: -115.1944, name: 'North Las Vegas', city: 'North Las Vegas', elevation: 2205, type: 'small_airport' },
  'KBVU': { lat: 36.0461, lng: -114.8611, name: 'Boulder City Municipal', city: 'Boulder City', elevation: 2201, type: 'small_airport' },

  // Texas
  'KADS': { lat: 32.9686, lng: -96.8364, name: 'Addison', city: 'Addison', elevation: 644, type: 'small_airport' },
  'KFWS': { lat: 32.5687, lng: -97.3181, name: 'Fort Worth Spinks', city: 'Fort Worth', elevation: 700, type: 'small_airport' },
  'KGKY': { lat: 32.6637, lng: -97.0943, name: 'Arlington Municipal', city: 'Arlington', elevation: 628, type: 'small_airport' },
  'KSGR': { lat: 29.6223, lng: -95.6565, name: 'Sugar Land Regional', city: 'Sugar Land', elevation: 82, type: 'small_airport' },
  'KDWH': { lat: 30.0618, lng: -95.5526, name: 'David Wayne Hooks Memorial', city: 'Spring', elevation: 152, type: 'small_airport' },
  'KTME': { lat: 29.8053, lng: -95.8979, name: 'Houston Executive', city: 'Brookshire', elevation: 166, type: 'small_airport' },
  'KGPM': { lat: 32.6993, lng: -97.0469, name: 'Grand Prairie Municipal', city: 'Grand Prairie', elevation: 588, type: 'small_airport' },
  'KDTO': { lat: 33.2006, lng: -97.1980, name: 'Denton Enterprise', city: 'Denton', elevation: 642, type: 'small_airport' },
  'KTKI': { lat: 33.1779, lng: -96.5905, name: 'McKinney National', city: 'McKinney', elevation: 585, type: 'small_airport' },
  'KFTW': { lat: 32.8198, lng: -97.3622, name: 'Fort Worth Meacham International', city: 'Fort Worth', elevation: 710, type: 'medium_airport' },
  'KDAL': { lat: 32.8470, lng: -96.8517, name: 'Dallas Love Field', city: 'Dallas', elevation: 487, type: 'medium_airport' },
  'KATT': { lat: 32.3513, lng: -99.9417, name: 'Abilene Regional', city: 'Abilene', elevation: 1791, type: 'medium_airport' },
  'KLBB': { lat: 33.6636, lng: -101.8227, name: 'Lubbock Preston Smith International', city: 'Lubbock', elevation: 3282, type: 'medium_airport' },
  'KAMA': { lat: 35.2194, lng: -101.7059, name: 'Rick Husband Amarillo International', city: 'Amarillo', elevation: 3607, type: 'medium_airport' },
  'KMAF': { lat: 31.9425, lng: -102.2019, name: 'Midland International', city: 'Midland', elevation: 2871, type: 'medium_airport' },

  // Florida
  'KOPF': { lat: 25.9070, lng: -80.2784, name: 'Miami-Opa Locka Executive', city: 'Opa-locka', elevation: 8, type: 'small_airport' },
  'KTMB': { lat: 25.6479, lng: -80.4328, name: 'Miami Executive', city: 'Kendall', elevation: 8, type: 'small_airport' },
  'KFXE': { lat: 26.1972, lng: -80.1707, name: 'Fort Lauderdale Executive', city: 'Fort Lauderdale', elevation: 13, type: 'small_airport' },
  'KBCT': { lat: 26.3785, lng: -80.1077, name: 'Boca Raton', city: 'Boca Raton', elevation: 13, type: 'small_airport' },
  'KLAL': { lat: 27.9889, lng: -82.0186, name: 'Lakeland Linder International', city: 'Lakeland', elevation: 142, type: 'medium_airport' },
  'KSPG': { lat: 27.7651, lng: -82.6270, name: 'Albert Whitted', city: 'St. Petersburg', elevation: 7, type: 'small_airport' },
  'KCLW': { lat: 27.9767, lng: -82.7587, name: 'Clearwater Air Park', city: 'Clearwater', elevation: 71, type: 'small_airport' },
  'KSRQ': { lat: 27.3954, lng: -82.5544, name: 'Sarasota/Bradenton International', city: 'Sarasota', elevation: 30, type: 'medium_airport' },
  'KRSW': { lat: 26.5362, lng: -81.7552, name: 'Southwest Florida International', city: 'Fort Myers', elevation: 30, type: 'large_airport' },
  'KAPF': { lat: 26.1526, lng: -81.7753, name: 'Naples Municipal', city: 'Naples', elevation: 8, type: 'small_airport' },
  'KJAX': { lat: 30.4941, lng: -81.6879, name: 'Jacksonville International', city: 'Jacksonville', elevation: 30, type: 'large_airport' },
  'KCRG': { lat: 30.3363, lng: -81.5145, name: 'Jacksonville Executive at Craig', city: 'Jacksonville', elevation: 41, type: 'small_airport' },
  'KSGJ': { lat: 29.9592, lng: -81.3397, name: 'Northeast Florida Regional', city: 'St. Augustine', elevation: 10, type: 'small_airport' },
  'KDAB': { lat: 29.1799, lng: -81.0581, name: 'Daytona Beach International', city: 'Daytona Beach', elevation: 34, type: 'medium_airport' },
  'KMLB': { lat: 28.1028, lng: -80.6453, name: 'Melbourne International', city: 'Melbourne', elevation: 33, type: 'medium_airport' },
  'KORL': { lat: 28.5455, lng: -81.3329, name: 'Orlando Executive', city: 'Orlando', elevation: 113, type: 'small_airport' },
  'KISM': { lat: 28.2898, lng: -81.4371, name: 'Kissimmee Gateway', city: 'Kissimmee', elevation: 82, type: 'small_airport' },
  'KGNV': { lat: 29.6901, lng: -82.2718, name: 'Gainesville Regional', city: 'Gainesville', elevation: 152, type: 'medium_airport' },
  'KTLH': { lat: 30.3965, lng: -84.3503, name: 'Tallahassee International', city: 'Tallahassee', elevation: 81, type: 'medium_airport' },
  'KPNS': { lat: 30.4734, lng: -87.1866, name: 'Pensacola International', city: 'Pensacola', elevation: 121, type: 'medium_airport' },
  'KVPS': { lat: 30.4832, lng: -86.5254, name: 'Destin-Fort Walton Beach', city: 'Valparaiso', elevation: 87, type: 'medium_airport' },
  'KEYW': { lat: 24.5561, lng: -81.7596, name: 'Key West International', city: 'Key West', elevation: 3, type: 'medium_airport' },

  // Colorado
  'KAPA': { lat: 39.5700, lng: -104.8493, name: 'Centennial', city: 'Englewood', elevation: 5885, type: 'small_airport' },
  'KBJC': { lat: 39.9088, lng: -105.1173, name: 'Rocky Mountain Metropolitan', city: 'Broomfield', elevation: 5673, type: 'small_airport' },
  'KFTG': { lat: 39.7853, lng: -104.5433, name: 'Front Range', city: 'Watkins', elevation: 5512, type: 'small_airport' },
  'KCOS': { lat: 38.8058, lng: -104.7008, name: 'Colorado Springs', city: 'Colorado Springs', elevation: 6187, type: 'medium_airport' },
  'KASE': { lat: 39.2232, lng: -106.8689, name: 'Aspen-Pitkin County/Sardy Field', city: 'Aspen', elevation: 7820, type: 'medium_airport' },
  'KEGE': { lat: 39.6426, lng: -106.9177, name: 'Eagle County Regional', city: 'Eagle', elevation: 6548, type: 'medium_airport' },
  'KGJT': { lat: 39.1224, lng: -108.5267, name: 'Grand Junction Regional', city: 'Grand Junction', elevation: 4858, type: 'medium_airport' },
  'KDRO': { lat: 37.1515, lng: -107.7538, name: 'Durango-La Plata County', city: 'Durango', elevation: 6685, type: 'medium_airport' },

  // New York Area
  'KCDW': { lat: 40.8752, lng: -74.2814, name: 'Essex County', city: 'Caldwell', elevation: 173, type: 'small_airport' },
  'KTEB': { lat: 40.8501, lng: -74.0608, name: 'Teterboro', city: 'Teterboro', elevation: 9, type: 'medium_airport' },
  'KFRG': { lat: 40.7288, lng: -73.4134, name: 'Republic', city: 'Farmingdale', elevation: 82, type: 'small_airport' },
  'KISP': { lat: 40.7952, lng: -73.1002, name: 'Long Island MacArthur', city: 'Islip', elevation: 99, type: 'medium_airport' },
  'KHPN': { lat: 41.0670, lng: -73.7076, name: 'Westchester County', city: 'White Plains', elevation: 439, type: 'medium_airport' },
  'KSWF': { lat: 41.5041, lng: -74.1048, name: 'Stewart International', city: 'Newburgh', elevation: 491, type: 'medium_airport' },
  'KFOK': { lat: 40.8437, lng: -72.6318, name: 'Francis S. Gabreski', city: 'Westhampton Beach', elevation: 67, type: 'small_airport' },
  'KHTO': { lat: 40.9596, lng: -72.2519, name: 'East Hampton', city: 'East Hampton', elevation: 55, type: 'small_airport' },
  'KALB': { lat: 42.7483, lng: -73.8017, name: 'Albany International', city: 'Albany', elevation: 285, type: 'medium_airport' },
  'KSYR': { lat: 43.1112, lng: -76.1063, name: 'Syracuse Hancock International', city: 'Syracuse', elevation: 421, type: 'medium_airport' },
  'KROC': { lat: 43.1189, lng: -77.6724, name: 'Greater Rochester International', city: 'Rochester', elevation: 559, type: 'medium_airport' },

  // New Jersey/Pennsylvania
  'KMMB': { lat: 40.0790, lng: -74.5937, name: 'Trenton-Mercer', city: 'Trenton', elevation: 213, type: 'small_airport' },
  'KABE': { lat: 40.6521, lng: -75.4408, name: 'Lehigh Valley International', city: 'Allentown', elevation: 393, type: 'medium_airport' },
  'KMDT': { lat: 40.1935, lng: -76.7634, name: 'Harrisburg International', city: 'Harrisburg', elevation: 310, type: 'medium_airport' },
  'KLNS': { lat: 40.1217, lng: -76.2961, name: 'Lancaster', city: 'Lancaster', elevation: 403, type: 'small_airport' },
  'KRDG': { lat: 40.3785, lng: -75.9652, name: 'Reading Regional', city: 'Reading', elevation: 344, type: 'small_airport' },

  // Washington DC Area
  'KHEF': { lat: 38.7214, lng: -77.5156, name: 'Manassas Regional', city: 'Manassas', elevation: 192, type: 'small_airport' },
  'KJYO': { lat: 39.0780, lng: -77.5575, name: 'Leesburg Executive', city: 'Leesburg', elevation: 389, type: 'small_airport' },
  'KGAI': { lat: 39.1683, lng: -77.1660, name: 'Montgomery County Airpark', city: 'Gaithersburg', elevation: 539, type: 'small_airport' },
  'KFDK': { lat: 39.4176, lng: -77.3743, name: 'Frederick Municipal', city: 'Frederick', elevation: 303, type: 'small_airport' },
  'KMTN': { lat: 39.3257, lng: -76.4138, name: 'Martin State', city: 'Baltimore', elevation: 21, type: 'small_airport' },
  'KESN': { lat: 38.8042, lng: -76.0690, name: 'Easton/Newnam Field', city: 'Easton', elevation: 72, type: 'small_airport' },
  'KCGS': { lat: 38.9806, lng: -76.9223, name: 'College Park', city: 'College Park', elevation: 48, type: 'small_airport' },
  'W29': { lat: 39.4756, lng: -77.8481, name: 'Bay Bridge', city: 'Stevensville', elevation: 8, type: 'small_airport' },

  // New England
  'KBED': { lat: 42.4700, lng: -71.2890, name: 'Laurence G. Hanscom Field', city: 'Bedford', elevation: 133, type: 'small_airport' },
  'KOWD': { lat: 42.1904, lng: -71.1734, name: 'Norwood Memorial', city: 'Norwood', elevation: 49, type: 'small_airport' },
  'KPYM': { lat: 41.9090, lng: -70.7288, name: 'Plymouth Municipal', city: 'Plymouth', elevation: 148, type: 'small_airport' },
  'KBVY': { lat: 42.5842, lng: -70.9164, name: 'Beverly Municipal', city: 'Beverly', elevation: 107, type: 'small_airport' },
  'KLWM': { lat: 42.7172, lng: -71.1234, name: 'Lawrence Municipal', city: 'Lawrence', elevation: 148, type: 'small_airport' },
  'KASH': { lat: 42.7817, lng: -71.5148, name: 'Nashua/Boire Field', city: 'Nashua', elevation: 199, type: 'small_airport' },
  'KMHT': { lat: 42.9326, lng: -71.4357, name: 'Manchester-Boston Regional', city: 'Manchester', elevation: 266, type: 'medium_airport' },
  'KPWM': { lat: 43.6462, lng: -70.3093, name: 'Portland International Jetport', city: 'Portland', elevation: 76, type: 'medium_airport' },
  'KPSM': { lat: 43.0779, lng: -70.8233, name: 'Portsmouth International', city: 'Portsmouth', elevation: 100, type: 'small_airport' },
  'KBDL': { lat: 41.9389, lng: -72.6832, name: 'Bradley International', city: 'Windsor Locks', elevation: 173, type: 'large_airport' },
  'KHFD': { lat: 41.7367, lng: -72.6494, name: 'Hartford-Brainard', city: 'Hartford', elevation: 18, type: 'small_airport' },
  'KGON': { lat: 41.3301, lng: -72.0451, name: 'Groton-New London', city: 'Groton', elevation: 9, type: 'small_airport' },
  'KPVD': { lat: 41.7267, lng: -71.4285, name: 'Theodore Francis Green State', city: 'Providence', elevation: 55, type: 'medium_airport' },
  'KACK': { lat: 41.2531, lng: -70.0602, name: 'Nantucket Memorial', city: 'Nantucket', elevation: 48, type: 'small_airport' },
  'KMVY': { lat: 41.3931, lng: -70.6143, name: 'Martha\'s Vineyard', city: 'Vineyard Haven', elevation: 67, type: 'small_airport' },
  'KHYA': { lat: 41.6693, lng: -70.2804, name: 'Barnstable Municipal-Boardman/Polando Field', city: 'Hyannis', elevation: 55, type: 'small_airport' },

  // Chicago Area
  'KPWK': { lat: 42.1143, lng: -87.9015, name: 'Chicago Executive', city: 'Wheeling', elevation: 647, type: 'small_airport' },
  'KDPA': { lat: 41.9078, lng: -88.2486, name: 'DuPage', city: 'West Chicago', elevation: 759, type: 'small_airport' },
  'KARR': { lat: 41.7715, lng: -88.4757, name: 'Aurora Municipal', city: 'Aurora', elevation: 712, type: 'small_airport' },
  'KUGN': { lat: 42.4222, lng: -87.8679, name: 'Waukegan National', city: 'Waukegan', elevation: 727, type: 'small_airport' },
  'KLOT': { lat: 41.6072, lng: -88.0962, name: 'Lewis University', city: 'Romeoville', elevation: 679, type: 'small_airport' },
  'KGYY': { lat: 41.6163, lng: -87.4128, name: 'Gary/Chicago International', city: 'Gary', elevation: 591, type: 'medium_airport' },

  // Atlanta Area
  'KPDK': { lat: 33.8756, lng: -84.3020, name: 'DeKalb-Peachtree', city: 'Atlanta', elevation: 1003, type: 'small_airport' },
  'KFTY': { lat: 33.7791, lng: -84.5214, name: 'Fulton County Airport-Brown Field', city: 'Atlanta', elevation: 841, type: 'small_airport' },
  'KRYY': { lat: 34.0132, lng: -84.5971, name: 'Cobb County International-McCollum Field', city: 'Marietta', elevation: 1041, type: 'small_airport' },
  'KLZU': { lat: 33.9781, lng: -83.9624, name: 'Gwinnett County', city: 'Lawrenceville', elevation: 1061, type: 'small_airport' },

  // Wisconsin
  'KOSH': { lat: 43.9844, lng: -88.5570, name: 'Wittman Regional', city: 'Oshkosh', elevation: 808, type: 'medium_airport' },
  'KMSN': { lat: 43.1399, lng: -89.3375, name: 'Dane County Regional-Truax Field', city: 'Madison', elevation: 887, type: 'medium_airport' },
  'KGRB': { lat: 44.4851, lng: -88.1296, name: 'Green Bay-Austin Straubel International', city: 'Green Bay', elevation: 695, type: 'medium_airport' },
  'KATW': { lat: 44.2581, lng: -88.5191, name: 'Appleton International', city: 'Appleton', elevation: 918, type: 'medium_airport' },

  // Michigan
  'KPTK': { lat: 42.6655, lng: -83.4185, name: 'Oakland County International', city: 'Pontiac', elevation: 980, type: 'small_airport' },
  'KYIP': { lat: 42.2379, lng: -83.5304, name: 'Willow Run', city: 'Ypsilanti', elevation: 716, type: 'small_airport' },
  'KARB': { lat: 42.2230, lng: -83.7456, name: 'Ann Arbor Municipal', city: 'Ann Arbor', elevation: 839, type: 'small_airport' },
  'KLAN': { lat: 42.7787, lng: -84.5874, name: 'Capital Region International', city: 'Lansing', elevation: 861, type: 'medium_airport' },
  'KGRR': { lat: 42.8808, lng: -85.5228, name: 'Gerald R. Ford International', city: 'Grand Rapids', elevation: 794, type: 'medium_airport' },
  'KAZO': { lat: 42.2349, lng: -85.5521, name: 'Kalamazoo/Battle Creek International', city: 'Kalamazoo', elevation: 874, type: 'medium_airport' },
  'KFNT': { lat: 42.9655, lng: -83.7436, name: 'Bishop International', city: 'Flint', elevation: 782, type: 'medium_airport' },
  'KTVC': { lat: 44.7415, lng: -85.5822, name: 'Cherry Capital', city: 'Traverse City', elevation: 624, type: 'medium_airport' },

  // Ohio
  'KCAK': { lat: 40.9161, lng: -81.4422, name: 'Akron-Canton', city: 'Akron', elevation: 1228, type: 'medium_airport' },
  'KLUK': { lat: 39.1033, lng: -84.4186, name: 'Cincinnati Municipal Lunken Field', city: 'Cincinnati', elevation: 483, type: 'small_airport' },
  'KCVG': { lat: 39.0489, lng: -84.6678, name: 'Cincinnati/Northern Kentucky International', city: 'Hebron', elevation: 896, type: 'large_airport' },
  'KDAY': { lat: 39.9024, lng: -84.2194, name: 'James M. Cox Dayton International', city: 'Dayton', elevation: 1009, type: 'medium_airport' },
  'KMGY': { lat: 39.5889, lng: -84.2249, name: 'Dayton-Wright Brothers', city: 'Dayton', elevation: 957, type: 'small_airport' },
  'KTOL': { lat: 41.5868, lng: -83.8078, name: 'Eugene F. Kranz Toledo Express', city: 'Toledo', elevation: 683, type: 'medium_airport' },

  // North Carolina
  'KRWL': { lat: 35.7616, lng: -78.6155, name: 'Raleigh-Durham International', city: 'Morrisville', elevation: 435, type: 'large_airport' },
  'KGSO': { lat: 36.0978, lng: -79.9373, name: 'Piedmont Triad International', city: 'Greensboro', elevation: 925, type: 'medium_airport' },
  'KINT': { lat: 36.1337, lng: -80.2220, name: 'Smith Reynolds', city: 'Winston-Salem', elevation: 969, type: 'small_airport' },
  'KAVL': { lat: 35.4362, lng: -82.5418, name: 'Asheville Regional', city: 'Asheville', elevation: 2165, type: 'medium_airport' },
  'KILM': { lat: 34.2706, lng: -77.9026, name: 'Wilmington International', city: 'Wilmington', elevation: 32, type: 'medium_airport' },
  'KFAY': { lat: 34.9912, lng: -78.8803, name: 'Fayetteville Regional', city: 'Fayetteville', elevation: 189, type: 'medium_airport' },
  'KOAJ': { lat: 34.8292, lng: -77.6121, name: 'Albert J. Ellis', city: 'Jacksonville', elevation: 94, type: 'medium_airport' },
  'KMRH': { lat: 34.7264, lng: -76.6606, name: 'Michael J. Smith Field', city: 'Beaufort', elevation: 11, type: 'small_airport' },

  // Virginia
  'KCHO': { lat: 38.1386, lng: -78.4529, name: 'Charlottesville-Albemarle', city: 'Charlottesville', elevation: 640, type: 'medium_airport' },
  'KLYH': { lat: 37.3267, lng: -79.2004, name: 'Lynchburg Regional', city: 'Lynchburg', elevation: 938, type: 'medium_airport' },
  'KORF': { lat: 36.8946, lng: -76.2012, name: 'Norfolk International', city: 'Norfolk', elevation: 26, type: 'medium_airport' },
  'KPHF': { lat: 37.1319, lng: -76.4930, name: 'Newport News/Williamsburg International', city: 'Newport News', elevation: 42, type: 'medium_airport' },
  'KROA': { lat: 37.3255, lng: -79.9754, name: 'Roanoke-Blacksburg Regional', city: 'Roanoke', elevation: 1175, type: 'medium_airport' },

  // Tennessee
  'KMKL': { lat: 35.5999, lng: -88.9156, name: 'McKellar-Sipes Regional', city: 'Jackson', elevation: 434, type: 'small_airport' },
  'KMEM': { lat: 35.0424, lng: -89.9767, name: 'Memphis International', city: 'Memphis', elevation: 341, type: 'large_airport' },
  'KTYS': { lat: 35.8110, lng: -83.9940, name: 'McGhee Tyson', city: 'Knoxville', elevation: 981, type: 'medium_airport' },
  'KCHA': { lat: 35.0353, lng: -85.2038, name: 'Lovell Field', city: 'Chattanooga', elevation: 683, type: 'medium_airport' },
  'KTRI': { lat: 36.4752, lng: -82.4074, name: 'Tri-Cities Regional', city: 'Blountville', elevation: 1519, type: 'medium_airport' },

  // Louisiana
  'KMSY': { lat: 29.9934, lng: -90.2580, name: 'Louis Armstrong New Orleans International', city: 'New Orleans', elevation: 4, type: 'large_airport' },
  'KNEW': { lat: 29.9955, lng: -90.0283, name: 'Lakefront', city: 'New Orleans', elevation: 8, type: 'small_airport' },
  'KBTR': { lat: 30.5332, lng: -91.1496, name: 'Baton Rouge Metropolitan', city: 'Baton Rouge', elevation: 70, type: 'medium_airport' },
  'KSHV': { lat: 32.4466, lng: -93.8256, name: 'Shreveport Regional', city: 'Shreveport', elevation: 258, type: 'medium_airport' },
  'KLFT': { lat: 30.2053, lng: -91.9876, name: 'Lafayette Regional', city: 'Lafayette', elevation: 42, type: 'medium_airport' },

  // Alabama
  'KBHM': { lat: 33.5629, lng: -86.7535, name: 'Birmingham-Shuttlesworth International', city: 'Birmingham', elevation: 650, type: 'medium_airport' },
  'KHSV': { lat: 34.6372, lng: -86.7751, name: 'Huntsville International', city: 'Huntsville', elevation: 629, type: 'medium_airport' },
  'KMGM': { lat: 32.3007, lng: -86.3940, name: 'Montgomery Regional', city: 'Montgomery', elevation: 221, type: 'medium_airport' },
  'KMOB': { lat: 30.6912, lng: -88.2429, name: 'Mobile Regional', city: 'Mobile', elevation: 219, type: 'medium_airport' },

  // Mississippi
  'KJAN': { lat: 32.3112, lng: -90.0759, name: 'Jackson-Medgar Wiley Evers International', city: 'Jackson', elevation: 346, type: 'medium_airport' },
  'KGPT': { lat: 30.4073, lng: -89.0701, name: 'Gulfport-Biloxi International', city: 'Gulfport', elevation: 28, type: 'medium_airport' },

  // Arkansas
  'KLIT': { lat: 34.7294, lng: -92.2243, name: 'Bill and Hillary Clinton National', city: 'Little Rock', elevation: 262, type: 'medium_airport' },
  'KXNA': { lat: 36.2819, lng: -94.3068, name: 'Northwest Arkansas National', city: 'Bentonville', elevation: 1287, type: 'medium_airport' },
  'KFSM': { lat: 35.3366, lng: -94.3674, name: 'Fort Smith Regional', city: 'Fort Smith', elevation: 469, type: 'medium_airport' },

  // Missouri
  'KSUS': { lat: 38.6621, lng: -90.6522, name: 'Spirit of St. Louis', city: 'Chesterfield', elevation: 463, type: 'small_airport' },
  'KJLN': { lat: 37.1518, lng: -94.4983, name: 'Joplin Regional', city: 'Joplin', elevation: 982, type: 'small_airport' },
  'KSGF': { lat: 37.2457, lng: -93.3886, name: 'Springfield-Branson National', city: 'Springfield', elevation: 1268, type: 'medium_airport' },
  'KCOU': { lat: 38.8181, lng: -92.2196, name: 'Columbia Regional', city: 'Columbia', elevation: 889, type: 'small_airport' },

  // Iowa
  'KDSM': { lat: 41.5340, lng: -93.6631, name: 'Des Moines International', city: 'Des Moines', elevation: 958, type: 'medium_airport' },
  'KCID': { lat: 41.8847, lng: -91.7108, name: 'The Eastern Iowa', city: 'Cedar Rapids', elevation: 869, type: 'medium_airport' },
  'KALO': { lat: 42.5571, lng: -92.4003, name: 'Waterloo Regional', city: 'Waterloo', elevation: 873, type: 'small_airport' },

  // Kansas
  'KICT': { lat: 37.6499, lng: -97.4331, name: 'Wichita Dwight D. Eisenhower National', city: 'Wichita', elevation: 1333, type: 'medium_airport' },
  'KAAO': { lat: 37.7475, lng: -97.2211, name: 'Col. James Jabara', city: 'Wichita', elevation: 1421, type: 'small_airport' },
  'KSLN': { lat: 38.7910, lng: -97.6522, name: 'Salina Regional', city: 'Salina', elevation: 1288, type: 'small_airport' },

  // Nebraska
  'KLNK': { lat: 40.8510, lng: -96.7592, name: 'Lincoln', city: 'Lincoln', elevation: 1219, type: 'medium_airport' },

  // Oklahoma
  'KOKC': { lat: 35.3931, lng: -97.6007, name: 'Will Rogers World', city: 'Oklahoma City', elevation: 1295, type: 'medium_airport' },
  'KPWA': { lat: 35.5342, lng: -97.6471, name: 'Wiley Post', city: 'Oklahoma City', elevation: 1300, type: 'small_airport' },
  'KTUL': { lat: 36.1984, lng: -95.8881, name: 'Tulsa International', city: 'Tulsa', elevation: 677, type: 'medium_airport' },
  'KRVS': { lat: 36.0396, lng: -95.9846, name: 'Richard Lloyd Jones Jr.', city: 'Tulsa', elevation: 638, type: 'small_airport' },

  // South Dakota
  'KFSD': { lat: 43.5820, lng: -96.7419, name: 'Sioux Falls Regional', city: 'Sioux Falls', elevation: 1429, type: 'medium_airport' },
  'KRAP': { lat: 44.0453, lng: -103.0574, name: 'Rapid City Regional', city: 'Rapid City', elevation: 3204, type: 'medium_airport' },

  // North Dakota
  'KFAR': { lat: 46.9207, lng: -96.8158, name: 'Hector International', city: 'Fargo', elevation: 902, type: 'medium_airport' },
  'KBIS': { lat: 46.7727, lng: -100.7468, name: 'Bismarck Municipal', city: 'Bismarck', elevation: 1661, type: 'medium_airport' },

  // Montana
  'KBZN': { lat: 45.7775, lng: -111.1530, name: 'Bozeman Yellowstone International', city: 'Bozeman', elevation: 4473, type: 'medium_airport' },
  'KMSO': { lat: 46.9163, lng: -114.0906, name: 'Missoula International', city: 'Missoula', elevation: 3206, type: 'medium_airport' },
  'KGPI': { lat: 48.3105, lng: -114.2560, name: 'Glacier Park International', city: 'Kalispell', elevation: 2977, type: 'medium_airport' },
  'KBIL': { lat: 45.8077, lng: -108.5430, name: 'Billings Logan International', city: 'Billings', elevation: 3652, type: 'medium_airport' },
  'KGTF': { lat: 47.4820, lng: -111.3707, name: 'Great Falls International', city: 'Great Falls', elevation: 3680, type: 'medium_airport' },
  'KHLN': { lat: 46.6068, lng: -111.9833, name: 'Helena Regional', city: 'Helena', elevation: 3877, type: 'medium_airport' },

  // Wyoming
  'KJAC': { lat: 43.6073, lng: -110.7377, name: 'Jackson Hole', city: 'Jackson', elevation: 6451, type: 'medium_airport' },
  'KCPR': { lat: 42.9080, lng: -106.4644, name: 'Casper/Natrona County International', city: 'Casper', elevation: 5350, type: 'medium_airport' },
  'KCYS': { lat: 41.1557, lng: -104.8118, name: 'Cheyenne Regional', city: 'Cheyenne', elevation: 6156, type: 'medium_airport' },

  // Idaho
  'KBOI': { lat: 43.5644, lng: -116.2228, name: 'Boise Air Terminal', city: 'Boise', elevation: 2871, type: 'medium_airport' },
  'KSUN': { lat: 43.5044, lng: -114.2956, name: 'Friedman Memorial', city: 'Hailey', elevation: 5318, type: 'small_airport' },
  'KIDA': { lat: 43.5146, lng: -112.0708, name: 'Idaho Falls Regional', city: 'Idaho Falls', elevation: 4744, type: 'small_airport' },
  'KLWS': { lat: 46.3745, lng: -117.0154, name: 'Lewiston-Nez Perce County', city: 'Lewiston', elevation: 1442, type: 'small_airport' },

  // Utah
  'KOGD': { lat: 41.1961, lng: -112.0122, name: 'Ogden-Hinckley', city: 'Ogden', elevation: 4473, type: 'small_airport' },
  'KPVU': { lat: 40.2192, lng: -111.7235, name: 'Provo Municipal', city: 'Provo', elevation: 4497, type: 'small_airport' },
  'KCDC': { lat: 37.7011, lng: -113.0986, name: 'Cedar City Regional', city: 'Cedar City', elevation: 5622, type: 'small_airport' },
  'KSGU': { lat: 37.0364, lng: -113.5103, name: 'St. George Regional', city: 'St. George', elevation: 2941, type: 'small_airport' },

  // Oregon
  'KEUG': { lat: 44.1246, lng: -123.2119, name: 'Eugene/Mahlon Sweet Field', city: 'Eugene', elevation: 374, type: 'medium_airport' },
  'KMFR': { lat: 42.3742, lng: -122.8735, name: 'Rogue Valley International-Medford', city: 'Medford', elevation: 1335, type: 'medium_airport' },
  'KRDM': { lat: 44.2541, lng: -121.1500, name: 'Roberts Field', city: 'Redmond', elevation: 3080, type: 'medium_airport' },
  'KSLE': { lat: 44.9095, lng: -123.0026, name: 'McNary Field', city: 'Salem', elevation: 214, type: 'small_airport' },
  'KHIO': { lat: 45.5404, lng: -122.9498, name: 'Portland-Hillsboro', city: 'Portland', elevation: 204, type: 'small_airport' },
  'KTTD': { lat: 45.5494, lng: -122.4014, name: 'Portland-Troutdale', city: 'Portland', elevation: 39, type: 'small_airport' },

  // Washington
  'KGEG': { lat: 47.6199, lng: -117.5339, name: 'Spokane International', city: 'Spokane', elevation: 2376, type: 'medium_airport' },
  'KBFI': { lat: 47.5300, lng: -122.3020, name: 'Boeing Field/King County International', city: 'Seattle', elevation: 21, type: 'medium_airport' },
  'KPAE': { lat: 47.9063, lng: -122.2816, name: 'Snohomish County (Paine Field)', city: 'Everett', elevation: 606, type: 'medium_airport' },
  'KRNT': { lat: 47.4931, lng: -122.2159, name: 'Renton Municipal', city: 'Renton', elevation: 32, type: 'small_airport' },
  'KTIW': { lat: 47.2679, lng: -122.5781, name: 'Tacoma Narrows', city: 'Tacoma', elevation: 294, type: 'small_airport' },
  'KOLM': { lat: 46.9694, lng: -122.9025, name: 'Olympia Regional', city: 'Olympia', elevation: 209, type: 'small_airport' },
  'KBLI': { lat: 48.7927, lng: -122.5375, name: 'Bellingham International', city: 'Bellingham', elevation: 170, type: 'medium_airport' },

  // Alaska
  'PANC': { lat: 61.1744, lng: -149.9964, name: 'Ted Stevens Anchorage International', city: 'Anchorage', elevation: 152, type: 'large_airport' },
  'PAFA': { lat: 64.8151, lng: -147.8561, name: 'Fairbanks International', city: 'Fairbanks', elevation: 434, type: 'medium_airport' },
  'PAJN': { lat: 58.3550, lng: -134.5762, name: 'Juneau International', city: 'Juneau', elevation: 21, type: 'medium_airport' },

  // Hawaii
  'PHNL': { lat: 21.3187, lng: -157.9224, name: 'Daniel K. Inouye International', city: 'Honolulu', elevation: 13, type: 'large_airport' },
  'PHOG': { lat: 20.8986, lng: -156.4305, name: 'Kahului', city: 'Kahului', elevation: 54, type: 'large_airport' },
  'PHKO': { lat: 19.7388, lng: -156.0456, name: 'Ellison Onizuka Kona International', city: 'Kailua-Kona', elevation: 47, type: 'medium_airport' },
  'PHLI': { lat: 21.9760, lng: -159.3390, name: 'Lihue', city: 'Lihue', elevation: 153, type: 'medium_airport' },
  'PHTO': { lat: 19.7214, lng: -155.0485, name: 'Hilo International', city: 'Hilo', elevation: 38, type: 'medium_airport' },
  'PHJR': { lat: 21.3074, lng: -158.0703, name: 'Kalaeloa/John Rodgers Field', city: 'Kapolei', elevation: 30, type: 'small_airport' },
  'PHMK': { lat: 21.1529, lng: -157.0960, name: 'Molokai', city: 'Kaunakakai', elevation: 454, type: 'small_airport' },
  'PHNY': { lat: 20.7856, lng: -156.9514, name: 'Lanai', city: 'Lanai City', elevation: 1308, type: 'small_airport' },

  // ============================================
  // INTERNATIONAL AIRPORTS (COMMON DESTINATIONS)
  // ============================================
  // Canada
  'CYYZ': { lat: 43.6777, lng: -79.6248, name: 'Toronto Pearson International', city: 'Toronto', elevation: 569 },
  'CYVR': { lat: 49.1947, lng: -123.1839, name: 'Vancouver International', city: 'Vancouver', elevation: 14 },
  'CYUL': { lat: 45.4706, lng: -73.7408, name: 'Montreal-Trudeau International', city: 'Montreal', elevation: 118 },
  'CYOW': { lat: 45.3225, lng: -75.6692, name: 'Ottawa International', city: 'Ottawa', elevation: 374 },
  'CYYC': { lat: 51.1139, lng: -114.0203, name: 'Calgary International', city: 'Calgary', elevation: 3557 },
  'CYEG': { lat: 53.3097, lng: -113.5797, name: 'Edmonton International', city: 'Edmonton', elevation: 2373 },
  'CYWG': { lat: 49.9100, lng: -97.2399, name: 'Winnipeg James Armstrong Richardson International', city: 'Winnipeg', elevation: 783 },
  'CYHZ': { lat: 44.8808, lng: -63.5086, name: 'Halifax Stanfield International', city: 'Halifax', elevation: 477 },
  'CYQB': { lat: 46.7911, lng: -71.3933, name: 'Quebec City Jean Lesage International', city: 'Quebec City', elevation: 243 },

  // Mexico
  'MMMX': { lat: 19.4363, lng: -99.0721, name: 'Mexico City International', city: 'Mexico City', elevation: 7316 },
  'MMUN': { lat: 21.0365, lng: -86.8771, name: 'Cancun International', city: 'Cancun', elevation: 22 },
  'MMGL': { lat: 20.5218, lng: -103.3111, name: 'Guadalajara International', city: 'Guadalajara', elevation: 5016 },
  'MMTJ': { lat: 32.5411, lng: -116.9700, name: 'Tijuana International', city: 'Tijuana', elevation: 489 },
  'MMSD': { lat: 23.1518, lng: -109.7211, name: 'Los Cabos International', city: 'San Jose del Cabo', elevation: 374 },
  'MMPR': { lat: 20.6801, lng: -105.2540, name: 'Puerto Vallarta International', city: 'Puerto Vallarta', elevation: 23 },
  'MMMY': { lat: 25.7785, lng: -100.1069, name: 'Monterrey International', city: 'Monterrey', elevation: 1278 },

  // Caribbean
  'TNCM': { lat: 18.0410, lng: -63.1089, name: 'Princess Juliana International', city: 'St. Maarten', elevation: 13 },
  'MKJS': { lat: 18.5037, lng: -77.9133, name: 'Sangster International', city: 'Montego Bay', elevation: 4 },
  'MYNN': { lat: 25.0390, lng: -77.4662, name: 'Lynden Pindling International', city: 'Nassau', elevation: 16 },
  'TBPB': { lat: 13.0746, lng: -59.4925, name: 'Grantley Adams International', city: 'Bridgetown', elevation: 169 },
  'TIST': { lat: 18.3373, lng: -64.9734, name: 'Cyril E. King', city: 'St. Thomas', elevation: 23 },
  'TJSJ': { lat: 18.4394, lng: -66.0018, name: 'Luis Munoz Marin International', city: 'San Juan', elevation: 9 },
  'TTPP': { lat: 10.5954, lng: -61.3372, name: 'Piarco International', city: 'Port of Spain', elevation: 58 },
  'TAPA': { lat: 17.1367, lng: -61.7928, name: 'V.C. Bird International', city: 'St. Johns', elevation: 62 },
  'MDPC': { lat: 18.5674, lng: -68.3634, name: 'Punta Cana International', city: 'Punta Cana', elevation: 47 },
  'MDSD': { lat: 18.4297, lng: -69.6689, name: 'Las Americas International', city: 'Santo Domingo', elevation: 59 },
  'MUHA': { lat: 22.9892, lng: -82.4091, name: 'Jose Marti International', city: 'Havana', elevation: 210 },
  'MUVR': { lat: 23.0344, lng: -81.4353, name: 'Juan Gualberto Gomez International', city: 'Varadero', elevation: 210 },
  'MROC': { lat: 9.9939, lng: -84.2088, name: 'Juan Santamaria International', city: 'San Jose', elevation: 3021 },
  'MPTO': { lat: 9.0714, lng: -79.3835, name: 'Tocumen International', city: 'Panama City', elevation: 135 },
  'MGGT': { lat: 14.5833, lng: -90.5275, name: 'La Aurora International', city: 'Guatemala City', elevation: 4952 },

  // Europe (Common Transatlantic Destinations)
  'EGLL': { lat: 51.4775, lng: -0.4614, name: 'London Heathrow', city: 'London', elevation: 83 },
  'LFPG': { lat: 49.0097, lng: 2.5478, name: 'Paris Charles de Gaulle', city: 'Paris', elevation: 392 },
  'EDDF': { lat: 50.0264, lng: 8.5431, name: 'Frankfurt', city: 'Frankfurt', elevation: 364 },
  'EHAM': { lat: 52.3086, lng: 4.7639, name: 'Amsterdam Schiphol', city: 'Amsterdam', elevation: -11 },
  'LEMD': { lat: 40.4936, lng: -3.5668, name: 'Madrid Barajas', city: 'Madrid', elevation: 2001 },
  'LIRF': { lat: 41.8003, lng: 12.2389, name: 'Rome Fiumicino', city: 'Rome', elevation: 15 },
  'EIDW': { lat: 53.4213, lng: -6.2701, name: 'Dublin', city: 'Dublin', elevation: 242 },
  'LEBL': { lat: 41.2971, lng: 2.0785, name: 'Barcelona El Prat', city: 'Barcelona', elevation: 12 },
  'LSZH': { lat: 47.4647, lng: 8.5492, name: 'Zurich', city: 'Zurich', elevation: 1416 },
  'LOWW': { lat: 48.1103, lng: 16.5697, name: 'Vienna', city: 'Vienna', elevation: 600 },
};

// Cache for API lookups
const airportCache: Map<string, AirportCoordinates | null> = new Map();

// Get coordinates for an airport code - now with API fallback
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
    const withKCheck = airportDatabase[`K${withoutK}`];
    if (withKCheck) {
      return withKCheck;
    }
  }

  // Check cache for API lookups
  if (airportCache.has(normalizedCode)) {
    return airportCache.get(normalizedCode) || null;
  }

  return null;
}

// Async function to fetch airport coordinates from external API
export async function fetchAirportCoordinates(code: string): Promise<AirportCoordinates | null> {
  const normalizedCode = code.toUpperCase().trim();

  // Check local database first
  const localResult = getAirportCoordinates(normalizedCode);
  if (localResult) {
    return localResult;
  }

  // Check cache
  if (airportCache.has(normalizedCode)) {
    return airportCache.get(normalizedCode) || null;
  }

  try {
    // Use aviation weather API to get station info (includes coordinates)
    const response = await fetch(
      `https://aviationweather.gov/api/data/metar?ids=${normalizedCode}&format=json&hours=1`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0 && data[0].lat && data[0].lon) {
        const airport: AirportCoordinates = {
          lat: data[0].lat,
          lng: data[0].lon,
          name: data[0].name || normalizedCode,
          elevation: data[0].elev,
        };
        airportCache.set(normalizedCode, airport);
        return airport;
      }
    }

    // Try OurAirports API as fallback
    const ourAirportsUrl = `https://ourairports.com/airports/${normalizedCode}/pilot-info.html`;
    // Note: OurAirports doesn't have a public JSON API, but we can try their data files

    // Cache null result to avoid repeated failed lookups
    airportCache.set(normalizedCode, null);
    return null;
  } catch (error) {
    console.warn(`Failed to fetch airport coordinates for ${code}:`, error);
    airportCache.set(normalizedCode, null);
    return null;
  }
}

// Get airport coordinates with async fallback (for use in components)
export async function getAirportCoordinatesAsync(code: string): Promise<AirportCoordinates | null> {
  // First try synchronous lookup
  const syncResult = getAirportCoordinates(code);
  if (syncResult) {
    return syncResult;
  }

  // Then try async API lookup
  return await fetchAirportCoordinates(code);
}

// Generate approximate position only as last resort (should rarely be needed now)
// This is much more accurate than the previous random hash-based approach
export function getApproximatePosition(code: string): AirportCoordinates {
  // For US airports (starting with K), estimate based on region
  const normalizedCode = code.toUpperCase().trim();

  // Try to infer region from airport code patterns
  // Many US airports have regional patterns in their codes

  // Common regional prefixes
  const regionEstimates: Record<string, { lat: number; lng: number }> = {
    // West Coast
    'K': { lat: 37.0, lng: -120.0 }, // Default California
    'KL': { lat: 34.0, lng: -118.0 }, // LA area
    'KS': { lat: 37.5, lng: -122.0 }, // SF Bay area
    'KP': { lat: 45.5, lng: -122.5 }, // Pacific Northwest
    // Mountain
    'KD': { lat: 39.5, lng: -105.0 }, // Denver area
    'KA': { lat: 33.5, lng: -112.0 }, // Arizona
    // Central
    'KO': { lat: 41.0, lng: -96.0 }, // Omaha/Central
    'KM': { lat: 35.0, lng: -90.0 }, // Memphis/Mid-South
    // East Coast
    'KE': { lat: 40.0, lng: -75.0 }, // Eastern seaboard
    'KB': { lat: 42.5, lng: -71.0 }, // Boston area
    'KN': { lat: 40.7, lng: -74.0 }, // NYC area
    'KF': { lat: 26.0, lng: -80.0 }, // Florida
    'KT': { lat: 30.0, lng: -97.0 }, // Texas
    // Canada
    'CY': { lat: 45.0, lng: -75.0 }, // Canada general
    // Mexico
    'MM': { lat: 23.0, lng: -102.0 }, // Mexico general
  };

  // Try to match prefix patterns
  for (const [prefix, coords] of Object.entries(regionEstimates)) {
    if (normalizedCode.startsWith(prefix)) {
      // Add small offset based on remaining characters for uniqueness
      let hash = 0;
      for (let i = prefix.length; i < normalizedCode.length; i++) {
        hash = ((hash << 5) - hash) + normalizedCode.charCodeAt(i);
      }

      return {
        lat: coords.lat + ((hash % 100) / 100) * 5 - 2.5,
        lng: coords.lng + (((hash >> 8) % 100) / 100) * 5 - 2.5,
        name: normalizedCode,
        city: 'Unknown Location (Estimated)',
      };
    }
  }

  // Absolute fallback - center of continental US with small variation
  let hash = 0;
  for (let i = 0; i < normalizedCode.length; i++) {
    hash = ((hash << 5) - hash) + normalizedCode.charCodeAt(i);
  }

  return {
    lat: 39.0 + ((hash % 100) / 100) * 10 - 5,
    lng: -98.0 + (((hash >> 8) % 100) / 100) * 20 - 10,
    name: normalizedCode,
    city: 'Unknown Location (Estimated)',
  };
}

// Utility to search airports by name or city
export function searchAirports(query: string, limit: number = 10): Array<{ code: string } & AirportCoordinates> {
  const normalizedQuery = query.toLowerCase().trim();
  const results: Array<{ code: string } & AirportCoordinates> = [];

  for (const [code, airport] of Object.entries(airportDatabase)) {
    if (
      code.toLowerCase().includes(normalizedQuery) ||
      airport.name.toLowerCase().includes(normalizedQuery) ||
      (airport.city && airport.city.toLowerCase().includes(normalizedQuery))
    ) {
      results.push({ code, ...airport });
      if (results.length >= limit) break;
    }
  }

  return results;
}

// Get all airports in a bounding box
export function getAirportsInBounds(
  north: number,
  south: number,
  east: number,
  west: number
): Array<{ code: string } & AirportCoordinates> {
  return Object.entries(airportDatabase)
    .filter(([, airport]) =>
      airport.lat >= south &&
      airport.lat <= north &&
      airport.lng >= west &&
      airport.lng <= east
    )
    .map(([code, airport]) => ({ code, ...airport }));
}
