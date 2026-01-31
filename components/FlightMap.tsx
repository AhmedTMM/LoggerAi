'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Plane, Users, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { getAirportCoordinates, getApproximatePosition } from '@/lib/airportData';
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
}

interface FlightMapProps {
  flights: Flight[];
  aircraft: Aircraft[];
  pilots: Pilot[];
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
        if (f.status === 'cancelled' || f.status === 'completed') return false;
        const isFlying = f.status === 'go' || f.status === 'caution' || f.status === 'no-go';
        const isPlanned = f.status === 'planned';
        if (isFlying && !showFlying) return false;
        if (isPlanned && !showPlanned) return false;
        return true;
      })
      .map((flight) => {
        const depCoords = getAirportCoordinates(flight.departureAirport) ||
          getApproximatePosition(flight.departureAirport);
        const arrCoords = flight.arrivalAirport
          ? getAirportCoordinates(flight.arrivalAirport) || getApproximatePosition(flight.arrivalAirport)
          : null;

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
        (f) => (typeof f.aircraft === 'object' ? f.aircraft._id : f.aircraft) === a._id
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

        {flightsWithPositions.map(({ flight, position, departurePos, arrivalPos }) => {
          const pilot = typeof flight.pilot === 'object' ? flight.pilot : null;
          const ac = typeof flight.aircraft === 'object' ? flight.aircraft : null;
          const isActive = flight.status === 'go' || flight.status === 'caution';

          return (
            <div key={flight._id}>
              {/* Flight path line for active flights */}
              {isActive && arrivalPos && (
                <Polyline
                  positions={[departurePos!, arrivalPos]}
                  pathOptions={{
                    color: flight.overallStatus === 'go' ? '#10b981' :
                           flight.overallStatus === 'caution' ? '#f59e0b' : '#ef4444',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '10, 10',
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
    </div>
  );
}
