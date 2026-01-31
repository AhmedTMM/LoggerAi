'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { Flight, Aircraft, Pilot } from '@/lib/types';

// Dynamically import FlightMap with SSR disabled (Leaflet requires window)
const FlightMap = dynamic(() => import('./FlightMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-zinc-500 text-sm">Loading flight map...</p>
      </div>
    </div>
  ),
});

interface FlightMapWrapperProps {
  flights: Flight[];
  aircraft: Aircraft[];
  pilots: Pilot[];
}

export default function FlightMapWrapper({ flights, aircraft, pilots }: FlightMapWrapperProps) {
  return <FlightMap flights={flights} aircraft={aircraft} pilots={pilots} />;
}
