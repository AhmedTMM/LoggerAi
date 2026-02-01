'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Plane, Users, Calendar, AlertTriangle, Clock, Cloud, Wind, Eye, Thermometer, ArrowRight } from 'lucide-react';
import { getAirportCoordinates, getApproximatePosition, airportDatabase } from '@/lib/airportData';
import type { Flight, Aircraft, Pilot } from '@/lib/types';

import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom colored markers for flight risk levels
function createColoredIcon(color: 'green' | 'yellow' | 'red') {
  const colors = {
    green: '#10b981', // emerald-500
    yellow: '#f59e0b', // amber-500
    red: '#ef4444', // red-500
  };

  return L.divIcon({
    className: 'custom-flight-marker',
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
      ">
        <svg viewBox="0 0 24 24" width="32" height="32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <path
            d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
            fill="${colors[color]}"
            stroke="white"
            stroke-width="1"
          />
        </svg>
        <div style="
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 8px;
          height: 8px;
          background: ${colors[color]};
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
    iconSize: [32, 36],
    iconAnchor: [16, 36],
    popupAnchor: [0, -36],
  });
}

const greenIcon = createColoredIcon('green');
const yellowIcon = createColoredIcon('yellow');
const redIcon = createColoredIcon('red');

function getIconForRisk(overallStatus: 'go' | 'caution' | 'no-go') {
  switch (overallStatus) {
    case 'go':
      return greenIcon;
    case 'caution':
      return yellowIcon;
    case 'no-go':
    default:
      return redIcon;
  }
}

// Component to fit map bounds to markers
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
    }
  }, [map, positions]);

  return null;
}

interface FlightWithPosition {
  flight: Flight;
  position: [number, number];
  departurePos: [number, number] | null;
  arrivalPos: [number, number] | null;
  departureAirport: { code: string; name: string; city?: string } | null;
  arrivalAirport: { code: string; name: string; city?: string } | null;
}

interface FlightMapProps {
  flights: Flight[];
  aircraft: Aircraft[];
  pilots: Pilot[];
}

// Get flight category color
function getFlightCategoryColor(category: string | undefined): string {
  switch (category) {
    case 'VFR':
      return '#10b981'; // green
    case 'MVFR':
      return '#3b82f6'; // blue
    case 'IFR':
      return '#ef4444'; // red
    case 'LIFR':
      return '#a855f7'; // purple
    default:
      return '#6b7280'; // gray
  }
}

// Get flight category background
function getFlightCategoryBg(category: string | undefined): string {
  switch (category) {
    case 'VFR':
      return 'bg-emerald-100 text-emerald-800';
    case 'MVFR':
      return 'bg-blue-100 text-blue-800';
    case 'IFR':
      return 'bg-red-100 text-red-800';
    case 'LIFR':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-zinc-100 text-zinc-800';
  }
}

// Generate route explanation text
function generateRouteExplanation(flight: Flight, depAirport: { name: string; city?: string } | null, arrAirport: { name: string; city?: string } | null): string {
  const pilot = typeof flight.pilot === 'object' ? flight.pilot : null;
  const aircraft = typeof flight.aircraft === 'object' ? flight.aircraft : null;
  const depName = depAirport?.city || depAirport?.name || flight.departureAirport;
  const arrName = arrAirport?.city || arrAirport?.name || flight.arrivalAirport || 'Local';

  let explanation = '';

  // Flight status explanation
  if (flight.status === 'go' || flight.status === 'caution') {
    explanation += `Currently flying from ${depName} to ${arrName}. `;
  } else if (flight.status === 'planned') {
    explanation += `Scheduled flight from ${depName} to ${arrName}. `;
  }

  // Aircraft info
  if (aircraft) {
    explanation += `Aircraft: ${aircraft.manufacturer} ${aircraft.model} (${aircraft.tailNumber}). `;
  }

  // Pilot info
  if (pilot) {
    const hours = pilot.experience?.totalHours || 0;
    explanation += `Pilot: ${pilot.name} (${hours} hrs). `;
  }

  // Weather summary
  if (flight.weather) {
    const wx = flight.weather;
    explanation += `Departure weather: ${wx.flightCategory || 'Unknown'}`;
    if (wx.wind) {
      explanation += `, Wind ${wx.wind.direction}° @ ${wx.wind.speed}kt`;
      if (wx.wind.gust) explanation += ` G${wx.wind.gust}`;
    }
    if (wx.visibility !== undefined) {
      explanation += `, Vis ${wx.visibility}SM`;
    }
    explanation += '. ';
  }

  // Safety status
  if (flight.overallStatus === 'go') {
    explanation += 'All safety checks passed.';
  } else if (flight.overallStatus === 'caution') {
    explanation += 'Some safety concerns - review recommended.';
  } else {
    explanation += 'Safety concerns identified - flight not recommended.';
  }

  return explanation;
}

// Calculate estimated distance between airports (rough great circle)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function FlightMap({ flights, aircraft, pilots }: FlightMapProps) {
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [showFlying, setShowFlying] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);

  // Process flights to get positions
  const flightsWithPositions = useMemo(() => {
    const now = new Date();

    return flights
      .filter((f) => {
        // Only exclude cancelled flights - show all others including completed
        if (f.status === 'cancelled') return false;
        const isFlying = f.status === 'go' || f.status === 'caution' || f.status === 'no-go';
        const isPlanned = f.status === 'planned';
        const isCompleted = f.status === 'completed';
        if (isFlying && !showFlying) return false;
        if ((isPlanned || isCompleted) && !showPlanned) return false;
        return true;
      })
      .map((flight) => {
        const depCoords = getAirportCoordinates(flight.departureAirport) ||
          getApproximatePosition(flight.departureAirport);
        const arrCoords = flight.arrivalAirport
          ? getAirportCoordinates(flight.arrivalAirport) || getApproximatePosition(flight.arrivalAirport)
          : null;

        // Get airport info from database
        const depAirportInfo = airportDatabase[flight.departureAirport.toUpperCase()] ||
          airportDatabase[`K${flight.departureAirport.toUpperCase()}`];
        const arrAirportInfo = flight.arrivalAirport ?
          (airportDatabase[flight.arrivalAirport.toUpperCase()] ||
           airportDatabase[`K${flight.arrivalAirport.toUpperCase()}`]) : null;

        // For flights in progress, show position between departure and arrival
        const isInProgress = flight.status === 'go' || flight.status === 'caution';
        let position: [number, number];

        if (isInProgress && arrCoords) {
          // Simulate flight position (midpoint for demo)
          const scheduledTime = new Date(flight.scheduledDate).getTime();
          const elapsedRatio = Math.min(1, Math.max(0, (now.getTime() - scheduledTime) / (2 * 60 * 60 * 1000))); // 2 hour flight
          position = [
            depCoords.lat + (arrCoords.lat - depCoords.lat) * elapsedRatio,
            depCoords.lng + (arrCoords.lng - depCoords.lng) * elapsedRatio,
          ];
        } else {
          position = [depCoords.lat, depCoords.lng];
        }

        return {
          flight,
          position,
          departurePos: [depCoords.lat, depCoords.lng] as [number, number],
          arrivalPos: arrCoords ? [arrCoords.lat, arrCoords.lng] as [number, number] : null,
          departureAirport: depAirportInfo ? {
            code: flight.departureAirport,
            name: depAirportInfo.name,
            city: depAirportInfo.city,
          } : { code: flight.departureAirport, name: flight.departureAirport },
          arrivalAirport: arrAirportInfo && flight.arrivalAirport ? {
            code: flight.arrivalAirport,
            name: arrAirportInfo.name,
            city: arrAirportInfo.city,
          } : flight.arrivalAirport ? { code: flight.arrivalAirport, name: flight.arrivalAirport } : null,
        };
      });
  }, [flights, showFlying, showPlanned]);

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const activeFlights = flights.filter(
      (f) => f.status === 'go' || f.status === 'caution'
    );
    const plannedFlights = flights.filter(
      (f) => f.status === 'planned' && new Date(f.scheduledDate) > now
    );
    const availableAircraft = aircraft.filter((a) => {
      // Check if aircraft is not currently in use
      const inUse = activeFlights.some(
        (f) => f.aircraft && (typeof f.aircraft === 'object' ? f.aircraft._id : f.aircraft) === a._id
      );
      return !inUse;
    });

    return {
      flyingNow: activeFlights.length,
      planned: plannedFlights.length,
      availableAircraft: availableAircraft.length,
      totalPilots: pilots.length,
    };
  }, [flights, aircraft, pilots]);

  // Get all positions for bounds fitting
  const allPositions = useMemo(() => {
    return flightsWithPositions.map((f) => f.position);
  }, [flightsWithPositions]);

  // Get pilot experience level text
  function getPilotExperience(pilot: Pilot | string): string {
    if (typeof pilot === 'string') return 'Unknown';
    const hours = pilot.experience?.totalHours || 0;
    if (hours >= 1000) return `Expert (${hours.toLocaleString()} hrs)`;
    if (hours >= 250) return `Experienced (${hours} hrs)`;
    if (hours >= 100) return `Intermediate (${hours} hrs)`;
    return `New (${hours} hrs)`;
  }

  // Get risk color class
  function getRiskColor(status: 'go' | 'caution' | 'no-go') {
    switch (status) {
      case 'go':
        return 'text-emerald-600 bg-emerald-50';
      case 'caution':
        return 'text-amber-600 bg-amber-50';
      case 'no-go':
        return 'text-red-600 bg-red-50';
    }
  }

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
      {/* Stats Overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg cursor-pointer transition-all ${
            showFlying ? 'bg-emerald-500 text-white' : 'bg-white/90 text-zinc-700 hover:bg-white'
          }`}
          onClick={() => setShowFlying(!showFlying)}
        >
          <Plane className="w-4 h-4" />
          <span className="font-semibold">{stats.flyingNow}</span>
          <span className="text-sm opacity-80">Flying Now</span>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg cursor-pointer transition-all ${
            showPlanned ? 'bg-blue-500 text-white' : 'bg-white/90 text-zinc-700 hover:bg-white'
          }`}
          onClick={() => setShowPlanned(!showPlanned)}
        >
          <Calendar className="w-4 h-4" />
          <span className="font-semibold">{stats.planned}</span>
          <span className="text-sm opacity-80">Planned</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur rounded-lg shadow-lg">
          <Plane className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-zinc-700">{stats.availableAircraft}</span>
          <span className="text-sm text-zinc-500">Available Aircraft</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur rounded-lg shadow-lg">
          <Users className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-zinc-700">{stats.totalPilots}</span>
          <span className="text-sm text-zinc-500">Pilots</span>
        </div>
      </div>

      {/* Risk Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg p-3">
        <div className="text-xs font-semibold text-zinc-600 mb-2">Risk Level</div>
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-zinc-600">Go</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-xs text-zinc-600">Caution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-xs text-zinc-600">No-Go</span>
          </div>
        </div>
      </div>

      {/* Weather Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg p-3">
        <div className="text-xs font-semibold text-zinc-600 mb-2">Flight Category</div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#10b981' }}></div>
            <span className="text-xs text-zinc-600">VFR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
            <span className="text-xs text-zinc-600">MVFR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }}></div>
            <span className="text-xs text-zinc-600">IFR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#a855f7' }}></div>
            <span className="text-xs text-zinc-600">LIFR</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={[39.8283, -98.5795]} // Center of US
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {allPositions.length > 0 && <FitBounds positions={allPositions} />}

        {flightsWithPositions.map(({ flight, position, departurePos, arrivalPos, departureAirport, arrivalAirport }) => {
          const pilot = typeof flight.pilot === 'object' ? flight.pilot : null;
          const ac = typeof flight.aircraft === 'object' ? flight.aircraft : null;
          const isActive = flight.status === 'go' || flight.status === 'caution';

          // Calculate distance if both airports known
          const distance = departurePos && arrivalPos ?
            calculateDistance(departurePos[0], departurePos[1], arrivalPos[0], arrivalPos[1]) : null;

          // Generate route explanation
          const routeExplanation = generateRouteExplanation(flight, departureAirport, arrivalAirport);

          return (
            <div key={flight._id}>
              {/* Flight path line from departure to destination for all flights */}
              {arrivalPos && departurePos && (
                <Polyline
                  positions={[departurePos, arrivalPos]}
                  pathOptions={{
                    color: flight.status === 'completed' ? '#6b7280' : // gray for completed
                           flight.overallStatus === 'go' ? '#10b981' :
                           flight.overallStatus === 'caution' ? '#f59e0b' : '#ef4444',
                    weight: isActive ? 3 : 2,
                    opacity: flight.status === 'completed' ? 0.4 : 0.7,
                    dashArray: isActive ? '10, 10' : undefined, // dashed for active, solid for others
                  }}
                />
              )}

              {/* Flight marker */}
              <Marker
                position={position}
                icon={getIconForRisk(flight.overallStatus)}
                eventHandlers={{
                  click: () => setSelectedFlight(flight),
                }}
              >
                {/* Hover Tooltip - Shows weather and route explanation */}
                <Tooltip
                  direction="top"
                  offset={[0, -20]}
                  opacity={0.95}
                  permanent={false}
                  className="flight-tooltip"
                >
                  <div className="min-w-[280px] max-w-[320px] p-0">
                    {/* Route Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900">{flight.departureAirport}</span>
                        <ArrowRight className="w-4 h-4 text-zinc-400" />
                        <span className="font-bold text-zinc-900">{flight.arrivalAirport || 'Local'}</span>
                      </div>
                      {distance && (
                        <span className="text-xs text-zinc-500">{distance} nm</span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${getRiskColor(flight.overallStatus)}`}>
                        {flight.overallStatus}
                      </span>
                      {isActive && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <Plane className="w-3 h-3" /> In Flight
                        </span>
                      )}
                      {flight.status === 'planned' && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Scheduled
                        </span>
                      )}
                    </div>

                    {/* Weather Section */}
                    {flight.weather && (
                      <div className="bg-zinc-50 rounded p-2 mb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Cloud className="w-4 h-4 text-zinc-400" />
                          <span className="text-xs font-semibold text-zinc-600">Departure Weather</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getFlightCategoryBg(flight.weather.flightCategory)}`}>
                            {flight.weather.flightCategory || 'UNK'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {flight.weather.wind && (
                            <div className="flex items-center gap-1 text-zinc-600">
                              <Wind className="w-3 h-3" />
                              {flight.weather.wind.direction}° @ {flight.weather.wind.speed}kt
                              {flight.weather.wind.gust && ` G${flight.weather.wind.gust}`}
                            </div>
                          )}
                          {flight.weather.visibility !== undefined && (
                            <div className="flex items-center gap-1 text-zinc-600">
                              <Eye className="w-3 h-3" />
                              {flight.weather.visibility} SM
                            </div>
                          )}
                          {flight.weather.ceiling !== undefined && (
                            <div className="flex items-center gap-1 text-zinc-600">
                              <Cloud className="w-3 h-3" />
                              Ceiling: {flight.weather.ceiling} ft
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Arrival Weather if available */}
                    {flight.arrivalWeather && (
                      <div className="bg-zinc-50 rounded p-2 mb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Cloud className="w-4 h-4 text-zinc-400" />
                          <span className="text-xs font-semibold text-zinc-600">Arrival Weather</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getFlightCategoryBg(flight.arrivalWeather.flightCategory)}`}>
                            {flight.arrivalWeather.flightCategory || 'UNK'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {flight.arrivalWeather.wind && (
                            <div className="flex items-center gap-1 text-zinc-600">
                              <Wind className="w-3 h-3" />
                              {flight.arrivalWeather.wind.direction}° @ {flight.arrivalWeather.wind.speed}kt
                            </div>
                          )}
                          {flight.arrivalWeather.visibility !== undefined && (
                            <div className="flex items-center gap-1 text-zinc-600">
                              <Eye className="w-3 h-3" />
                              {flight.arrivalWeather.visibility} SM
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Aircraft & Pilot */}
                    <div className="flex items-center gap-4 text-xs text-zinc-600 mb-2">
                      {ac && (
                        <span className="flex items-center gap-1">
                          <Plane className="w-3 h-3" />
                          {ac.tailNumber}
                        </span>
                      )}
                      {pilot && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {pilot.name}
                        </span>
                      )}
                    </div>

                    {/* Route Explanation */}
                    <div className="text-xs text-zinc-500 border-t border-zinc-200 pt-2 leading-relaxed">
                      {routeExplanation}
                    </div>

                    {/* Safety Analysis Summary */}
                    {flight.safetyAnalysisSnapshot && (
                      <div className="mt-2 pt-2 border-t border-zinc-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-600">Safety Score</span>
                          <span className={`text-xs font-bold ${
                            flight.safetyAnalysisSnapshot.overallScore >= 80 ? 'text-emerald-600' :
                            flight.safetyAnalysisSnapshot.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {flight.safetyAnalysisSnapshot.overallScore}/100
                          </span>
                        </div>
                        {flight.safetyAnalysisSnapshot.riskScenarios &&
                         flight.safetyAnalysisSnapshot.riskScenarios.length > 0 && (
                          <div className="mt-1 text-xs text-zinc-500">
                            <AlertTriangle className="w-3 h-3 inline mr-1" />
                            {flight.safetyAnalysisSnapshot.riskScenarios.length} risk scenario(s) identified
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Tooltip>

                {/* Click Popup - Full details */}
                <Popup maxWidth={300}>
                  <div className="min-w-[250px]">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Plane className="w-5 h-5 text-blue-500" />
                        <span className="font-bold text-zinc-800">
                          {flight.departureAirport} → {flight.arrivalAirport || 'Local'}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${getRiskColor(
                          flight.overallStatus
                        )}`}
                      >
                        {flight.overallStatus}
                      </span>
                    </div>

                    {/* Airport Names */}
                    <div className="text-xs text-zinc-500 mb-3">
                      <div>{departureAirport?.name || flight.departureAirport}</div>
                      {arrivalAirport && <div>→ {arrivalAirport.name}</div>}
                      {distance && <div className="mt-1 font-medium">Distance: {distance} nm</div>}
                    </div>

                    {/* Flight Info */}
                    <div className="space-y-2 text-sm">
                      {/* Pilot */}
                      <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                        <Users className="w-4 h-4 text-zinc-400" />
                        <div>
                          <div className="font-medium text-zinc-800">
                            {pilot?.name || 'Unknown Pilot'}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {pilot ? getPilotExperience(pilot) : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Aircraft */}
                      <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                        <Plane className="w-4 h-4 text-zinc-400" />
                        <div>
                          <div className="font-medium text-zinc-800">
                            {ac?.tailNumber || 'Unknown Aircraft'}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {ac ? `${ac.manufacturer} ${ac.model}` : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Weather Summary */}
                      {flight.weather && (
                        <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                          <Cloud className="w-4 h-4 text-zinc-400" />
                          <div>
                            <div className="font-medium text-zinc-800 flex items-center gap-2">
                              Weather
                              <span className={`text-xs px-1.5 py-0.5 rounded ${getFlightCategoryBg(flight.weather.flightCategory)}`}>
                                {flight.weather.flightCategory}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500">
                              {flight.weather.wind && `Wind: ${flight.weather.wind.direction}° @ ${flight.weather.wind.speed}kt`}
                              {flight.weather.visibility !== undefined && ` | Vis: ${flight.weather.visibility}SM`}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Schedule */}
                      <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                        <Clock className="w-4 h-4 text-zinc-400" />
                        <div>
                          <div className="font-medium text-zinc-800">
                            {new Date(flight.scheduledDate).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {new Date(flight.scheduledDate).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Status indicator */}
                      {flight.status === 'planned' && (
                        <div className="flex items-center gap-2 text-blue-600 text-xs mt-2">
                          <Calendar className="w-3 h-3" />
                          Scheduled Flight
                        </div>
                      )}
                      {isActive && (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs mt-2">
                          <Plane className="w-3 h-3" />
                          Currently In Flight
                        </div>
                      )}
                      {flight.overallStatus === 'no-go' && (
                        <div className="flex items-center gap-2 text-red-600 text-xs mt-2">
                          <AlertTriangle className="w-3 h-3" />
                          Flight has safety concerns
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
      </MapContainer>

      {/* No flights message */}
      {flightsWithPositions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/80 z-[500]">
          <div className="text-center p-6 bg-white rounded-xl shadow-lg">
            <Plane className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-600 font-medium">No active or planned flights</p>
            <p className="text-zinc-400 text-sm mt-1">Flights will appear here when scheduled</p>
          </div>
        </div>
      )}

      {/* Custom tooltip styles */}
      <style jsx global>{`
        .flight-tooltip {
          background: white !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
          padding: 12px !important;
        }
        .flight-tooltip .leaflet-tooltip-content {
          margin: 0 !important;
        }
        .flight-tooltip::before {
          border-top-color: white !important;
        }
        .leaflet-tooltip-top:before {
          border-top-color: white !important;
        }
      `}</style>
    </div>
  );
}
