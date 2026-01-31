'use client';

import { Plane, Users, Calendar, ArrowRight, Map } from 'lucide-react';
import Link from 'next/link';
import { useAircraft, usePilots, useFlights } from '@/lib/hooks';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';
import FlightMapWrapper from '@/components/FlightMapWrapper';
import type { Flight } from '@/lib/types';

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="bg-white rounded-xl border border-zinc-200 p-6 hover:border-zinc-300 hover:shadow-lg transition-all">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-zinc-900">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm text-zinc-500 group-hover:text-zinc-700">
          View all <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data: aircraft = [] } = useAircraft();
  const { data: pilots = [] } = usePilots();
  const { data: flights = [] } = useFlights();

  const upcomingFlights = flights.filter(
    (f: Flight) => new Date(f.scheduledDate) > new Date() && f.status !== 'cancelled'
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Aviation Intelligence</h1>
        <p className="text-zinc-500 mt-1">Fleet safety and compliance at a glance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Aircraft in Fleet"
          value={aircraft.length}
          icon={Plane}
          href="/aircraft"
          color="bg-blue-500"
        />
        <StatCard
          label="Active Pilots"
          value={pilots.length}
          icon={Users}
          href="/pilots"
          color="bg-emerald-500"
        />
        <StatCard
          label="Upcoming Flights"
          value={upcomingFlights.length}
          icon={Calendar}
          href="/flights"
          color="bg-amber-500"
        />
      </div>

      {/* Flight Map */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Map className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-zinc-900">Live Flight Map</h2>
          </div>
          <p className="text-sm text-zinc-500">
            Click on toggles to filter flights
          </p>
        </div>
        <FlightMapWrapper flights={flights} aircraft={aircraft} pilots={pilots} />
      </div>

      {/* Recent Flights */}
      {flights.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">Recent Flights</h2>
            <Link
              href="/flights"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {flights.slice(0, 5).map((flight: Flight) => (
              <Link
                key={flight._id}
                href="/flights"
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${
                    flight.overallStatus === 'go' ? 'bg-emerald-500' :
                    flight.overallStatus === 'caution' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="font-medium text-zinc-900">
                      {flight.departureAirport} → {flight.arrivalAirport || 'Local'}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDate(flight.scheduledDate)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={flight.overallStatus} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
