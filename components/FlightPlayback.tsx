'use client';

import React from 'react';
import { X, ExternalLink, Plane, Clock, MapPin, Navigation, Info, Search, Play, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getFlightPlaybackInfo, type FlightPlaybackInfo } from '@/lib/utils/icaoHex';
import { cn } from '@/lib/utils';

interface FlightPlaybackModalProps {
  isOpen: boolean;
  onClose: () => void;
  flight: {
    date: string | Date;
    departureAirport: string;
    arrivalAirport?: string;
    route?: string;
    aircraftIdent?: string;
    totalTime?: number;
    remarks?: string;
  };
}

export function FlightPlaybackModal({ isOpen, onClose, flight }: FlightPlaybackModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const aircraftIdent = flight.aircraftIdent || '';
  const flightDate = typeof flight.date === 'string' ? flight.date : flight.date.toISOString().split('T')[0];

  // Get playback info
  const playbackInfo: FlightPlaybackInfo = aircraftIdent
    ? getFlightPlaybackInfo(aircraftIdent, flightDate)
    : {
        nNumber: '',
        icaoHex: null,
        playbackUrl: null,
        searchUrl: null,
        date: flightDate,
        error: 'No aircraft identifier available',
      };

  const formatDate = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const copyIcaoHex = () => {
    if (playbackInfo.icaoHex) {
      navigator.clipboard.writeText(playbackInfo.icaoHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openPlayback = () => {
    if (playbackInfo.playbackUrl) {
      window.open(playbackInfo.playbackUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const openSearch = () => {
    if (playbackInfo.searchUrl) {
      window.open(playbackInfo.searchUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Play className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Flight Playback</h2>
              <p className="text-sm text-zinc-500">Replay via ADS-B Exchange</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Flight Details */}
          <div className="bg-zinc-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-zinc-900 text-sm">Flight Details</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                <div>
                  <p className="text-xs text-zinc-500">Date</p>
                  <p className="text-sm font-medium text-zinc-900">{formatDate(flight.date)}</p>
                </div>
              </div>

              {aircraftIdent && (
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-zinc-400" />
                  <div>
                    <p className="text-xs text-zinc-500">Aircraft</p>
                    <p className="text-sm font-medium text-blue-600">{aircraftIdent}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-zinc-400" />
              <div className="flex items-center gap-1">
                <span className="font-medium text-zinc-900">{flight.departureAirport}</span>
                <Navigation className="w-3 h-3 text-zinc-400 mx-1" />
                <span className="font-medium text-zinc-900">{flight.arrivalAirport || flight.departureAirport}</span>
              </div>
            </div>

            {flight.route && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Route</p>
                <p className="text-sm text-zinc-700 font-mono bg-zinc-100 px-2 py-1 rounded">
                  {flight.route}
                </p>
              </div>
            )}

            {flight.totalTime !== undefined && flight.totalTime > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 rounded border border-amber-200">
                <Clock className="w-4 h-4 text-amber-600" />
                <div>
                  <p className="text-xs text-amber-700">Hobbs Time</p>
                  <p className="text-sm font-bold text-amber-900">{flight.totalTime.toFixed(1)} hours</p>
                </div>
              </div>
            )}
          </div>

          {/* ICAO Hex Info */}
          {playbackInfo.icaoHex ? (
            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-emerald-900 text-sm">Aircraft ICAO Hex Code</h3>
                <Badge variant="success">Ready</Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-emerald-100 px-3 py-2 rounded font-mono text-lg text-emerald-800">
                  {playbackInfo.icaoHex}
                </code>
                <button
                  onClick={copyIcaoHex}
                  className="p-2 hover:bg-emerald-100 rounded transition-colors"
                  title="Copy ICAO hex"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Copy className="w-5 h-5 text-emerald-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-emerald-700 mt-2">
                Converted from N-number: {playbackInfo.nNumber}
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-900 text-sm">Cannot Generate Playback Link</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    {playbackInfo.error || 'Aircraft identifier not available or invalid.'}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    You can still search manually on ADS-B Exchange using the flight details above.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 text-sm mb-2">Finding Your Flight</h3>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Click "Open Flight Playback" to view the aircraft's tracks for {formatDate(flight.date)}</li>
                  <li>
                    Look for a flight matching your route:
                    <span className="font-medium"> {flight.departureAirport} → {flight.arrivalAirport || flight.departureAirport}</span>
                  </li>
                  {flight.totalTime && flight.totalTime > 0 && (
                    <li>
                      The flight duration should be approximately
                      <span className="font-bold"> {flight.totalTime.toFixed(1)} hours</span> (Hobbs time)
                    </li>
                  )}
                  <li>Use the timeline slider at the bottom to replay the flight track</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Remarks if available */}
          {flight.remarks && (
            <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
              <p className="text-xs text-zinc-500 mb-1">Remarks</p>
              <p className="text-sm text-zinc-700">{flight.remarks}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 space-y-2">
          {playbackInfo.playbackUrl && (
            <Button
              onClick={openPlayback}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Open Flight Playback
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          )}

          {playbackInfo.searchUrl && (
            <Button
              onClick={openSearch}
              variant="outline"
              className="w-full"
            >
              <Search className="w-4 h-4 mr-2" />
              Search Aircraft History
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          )}

          {!playbackInfo.icaoHex && (
            <Button
              onClick={() => window.open('https://globe.adsbexchange.com/', '_blank', 'noopener,noreferrer')}
              variant="outline"
              className="w-full"
            >
              <Search className="w-4 h-4 mr-2" />
              Open ADS-B Exchange
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          )}

          <Button variant="ghost" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// Compact playback button for use in lists
interface FlightPlaybackButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function FlightPlaybackButton({ onClick, disabled, className }: FlightPlaybackButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        disabled
          ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          : "bg-blue-100 text-blue-600 hover:bg-blue-200",
        className
      )}
      title={disabled ? "Playback not available" : "Replay flight on ADS-B Exchange"}
    >
      <Play className="w-4 h-4" />
    </button>
  );
}
