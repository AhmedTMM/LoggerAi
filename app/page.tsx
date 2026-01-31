'use client';

import { Plane, Users, Calendar, ArrowRight } from 'lucide-react';
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
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="mt-3 flex items-center text-sm text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Your fleet overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Aircraft"
          value={aircraft.length}
          icon={Plane}
          href="/aircraft"
          color="bg-blue-500"
        />
        <StatCard
          label="Pilots"
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
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Flight Map</h2>
        <FlightMapWrapper flights={flights} aircraft={aircraft} pilots={pilots} />
      </div>

      {/* Recent Flights */}
      {flights.length > 0 && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Flights</h2>
            <Link
              href="/flights"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2">
            {flights.slice(0, 5).map((flight: Flight) => (
              <Link
                key={flight._id}
                href="/flights"
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    flight.overallStatus === 'go' ? 'bg-emerald-500' :
                    flight.overallStatus === 'caution' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {flight.departureAirport} → {flight.arrivalAirport || 'Local'}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
