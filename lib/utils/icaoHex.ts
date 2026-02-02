// N-Number to ICAO Hex Code Conversion
// Based on FAA Mode-S code allocation algorithm

// US aircraft use ICAO addresses from A00001 to ADF7C7
// The algorithm maps N-numbers to hex codes systematically

const ICAO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O
const ICAO_ALPHABET_SIZE = 24;
const DIGIT_OFFSET = [1, 601, 601 + 600 * 26 + 1, 601 + 2 * 600 * 26 + 1, 601 + 3 * 600 * 26 + 1];

/**
 * Convert US N-number to ICAO 24-bit hex address (Mode-S code)
 * @param nNumber - Aircraft tail number (with or without N prefix)
 * @returns ICAO hex code in uppercase (e.g., "A12345") or null if invalid
 */
export function nNumberToIcaoHex(nNumber: string): string | null {
  // Clean and validate the N-number
  let clean = nNumber.toUpperCase().replace(/\s/g, '');
  if (clean.startsWith('N')) {
    clean = clean.substring(1);
  }

  if (!clean || clean.length > 5) {
    return null;
  }

  // N-numbers must start with a digit 1-9
  const firstDigit = parseInt(clean[0], 10);
  if (isNaN(firstDigit) || firstDigit < 1 || firstDigit > 9) {
    return null;
  }

  try {
    // Compute the offset from the base ICAO address (0xA00001)
    const offset = computeNNumberOffset(clean);
    if (offset === null) {
      return null;
    }

    // US ICAO addresses start at 0xA00001
    const icaoAddress = 0xA00001 + offset - 1;

    // Check if we exceed the US allocation range
    if (icaoAddress > 0xADF7C7) {
      return null;
    }

    return icaoAddress.toString(16).toUpperCase().padStart(6, '0');
  } catch (e) {
    return null;
  }
}

/**
 * Compute the offset for an N-number in the FAA allocation scheme
 */
function computeNNumberOffset(nNumber: string): number | null {
  const len = nNumber.length;

  // Get first digit (1-9)
  const d1 = parseInt(nNumber[0], 10);
  if (isNaN(d1) || d1 < 1) return null;

  // Base offset for the first digit
  // Each first digit covers a large block of addresses
  // N1xxxx, N2xxxx, etc.
  const blockSize = 101711; // Size of each major block
  let offset = (d1 - 1) * blockSize + 1;

  if (len === 1) {
    return offset;
  }

  // Second character
  const c2 = nNumber[1];
  const d2 = parseInt(c2, 10);

  if (!isNaN(d2)) {
    // Second character is a digit (0-9)
    // Each second digit covers a block of 10111 addresses
    offset += d2 * 10111;

    if (len === 2) {
      return offset;
    }

    // Third character
    const c3 = nNumber[2];
    const d3 = parseInt(c3, 10);

    if (!isNaN(d3)) {
      // Third is digit
      offset += d3 * 951;

      if (len === 3) {
        return offset;
      }

      // Fourth character
      const c4 = nNumber[3];
      const d4 = parseInt(c4, 10);

      if (!isNaN(d4)) {
        // Fourth is digit
        offset += d4 * 35;

        if (len === 4) {
          return offset;
        }

        // Fifth character
        const c5 = nNumber[4];
        const d5 = parseInt(c5, 10);

        if (!isNaN(d5)) {
          // Fifth is digit - N12345 format
          offset += d5 + 1;
          return offset;
        } else {
          // Fifth is letter - N1234A format
          const l5 = getLetterIndex(c5);
          if (l5 === null) return null;
          offset += 10 + l5 + 1;
          return offset;
        }
      } else {
        // Fourth is letter - N123AB format
        const l4 = getLetterIndex(c4);
        if (l4 === null) return null;
        offset += 10 * 35 + l4 * 25;

        if (len === 4) {
          return offset + 1;
        }

        // Fifth character must be letter
        const c5 = nNumber[4];
        const l5 = getLetterIndex(c5);
        if (l5 === null) return null;
        offset += l5 + 2;
        return offset;
      }
    } else {
      // Third is letter - N12ABC format
      const l3 = getLetterIndex(c3);
      if (l3 === null) return null;
      offset += 10 * 951 + l3 * 601;

      if (len === 3) {
        return offset + 1;
      }

      // Fourth character must be letter
      const c4 = nNumber[3];
      const l4 = getLetterIndex(c4);
      if (l4 === null) return null;
      offset += l4 * 25;

      if (len === 4) {
        return offset + 2;
      }

      // Fifth character must be letter
      const c5 = nNumber[4];
      const l5 = getLetterIndex(c5);
      if (l5 === null) return null;
      offset += l5 + 3;
      return offset;
    }
  } else {
    // Second character is letter - N1ABCD format
    const l2 = getLetterIndex(c2);
    if (l2 === null) return null;
    offset += 10 * 10111 + l2 * 601;

    if (len === 2) {
      return offset + 1;
    }

    // Third character must be letter
    const c3 = nNumber[2];
    const l3 = getLetterIndex(c3);
    if (l3 === null) return null;
    offset += l3 * 25;

    if (len === 3) {
      return offset + 2;
    }

    // Fourth character must be letter
    const c4 = nNumber[3];
    const l4 = getLetterIndex(c4);
    if (l4 === null) return null;
    offset += l4 + 3;

    return offset;
  }
}

/**
 * Get index for a letter in the ICAO alphabet (no I or O)
 */
function getLetterIndex(char: string): number | null {
  const upper = char.toUpperCase();
  const index = ICAO_ALPHABET.indexOf(upper);
  return index >= 0 ? index : null;
}

/**
 * Generate ADS-B Exchange playback URL for a flight using registration (tail number)
 * @param registration - Aircraft registration/tail number (e.g., "N12345")
 * @param date - Flight date (YYYY-MM-DD format or Date object)
 * @returns URL for ADS-B Exchange globe with trace enabled
 */
export function getAdsbExchangePlaybackUrlByRegistration(registration: string, date: string | Date): string {
  const dateStr = typeof date === 'string' ? date : formatDateForAdsb(date);
  // Remove 'N' prefix if present and re-add it to ensure consistency
  const cleanReg = registration.toUpperCase().replace(/^N/, '');
  // Use registration search with showTrace for historical data
  // The map will load with historical traces for the specified date
  // Adding startTime to force historical mode at beginning of day
  return `https://globe.adsbexchange.com/?find=${cleanReg}&showTrace=${dateStr}&startTime=${dateStr}T00:00:00Z`;
}

/**
 * Generate ADS-B Exchange search URL for finding flights by registration
 * @param registration - Aircraft registration/tail number
 * @returns URL for ADS-B Exchange search
 */
export function getAdsbExchangeSearchUrlByRegistration(registration: string): string {
  const cleanReg = registration.toUpperCase().replace(/^N/, '');
  return `https://globe.adsbexchange.com/?registration=N${cleanReg}`;
}

/**
 * Generate ADS-B Exchange playback URL for a flight
 * @param icaoHex - Aircraft ICAO hex code
 * @param date - Flight date (YYYY-MM-DD format or Date object)
 * @returns URL for ADS-B Exchange globe with trace enabled
 */
export function getAdsbExchangePlaybackUrl(icaoHex: string, date: string | Date): string {
  const dateStr = typeof date === 'string' ? date : formatDateForAdsb(date);
  return `https://globe.adsbexchange.com/?icao=${icaoHex.toLowerCase()}&showTrace=${dateStr}`;
}

/**
 * Generate ADS-B Exchange search URL for finding flights by aircraft
 * @param icaoHex - Aircraft ICAO hex code
 * @returns URL for ADS-B Exchange search
 */
export function getAdsbExchangeSearchUrl(icaoHex: string): string {
  return `https://globe.adsbexchange.com/?icao=${icaoHex.toLowerCase()}`;
}

/**
 * Format date for ADS-B Exchange URL
 */
function formatDateForAdsb(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get flight playback info for an N-number and date
 */
export interface FlightPlaybackInfo {
  nNumber: string;
  icaoHex: string | null;
  playbackUrl: string | null;
  searchUrl: string | null;
  date: string;
  error?: string;
}

export function getFlightPlaybackInfo(nNumber: string, date: string | Date): FlightPlaybackInfo {
  const dateStr = typeof date === 'string' ? date : formatDateForAdsb(date);

  if (!nNumber) {
    return {
      nNumber: '',
      icaoHex: null,
      playbackUrl: null,
      searchUrl: null,
      date: dateStr,
      error: 'No aircraft identifier available',
    };
  }

  // Use registration-based URLs (more reliable than hex conversion)
  return {
    nNumber,
    icaoHex: null, // No longer using hex conversion
    playbackUrl: getAdsbExchangePlaybackUrlByRegistration(nNumber, dateStr),
    searchUrl: getAdsbExchangeSearchUrlByRegistration(nNumber),
    date: dateStr,
  };
}
