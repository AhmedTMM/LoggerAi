'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Aircraft, Pilot, Flight } from './types';

// Generate a simple unique ID for anonymous mode
const generateId = () => `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface AnonymousData {
  aircraft: Aircraft[];
  pilots: Pilot[];
  flights: Flight[];
}

interface AnonymousContextType {
  isAnonymous: boolean;
  setAnonymous: (value: boolean) => void;
  data: AnonymousData;
  // Aircraft operations
  addAircraft: (aircraft: Partial<Aircraft>) => Aircraft;
  updateAircraft: (id: string, aircraft: Partial<Aircraft>) => Aircraft | null;
  deleteAircraft: (id: string) => void;
  getAircraft: (id?: string) => Aircraft | Aircraft[] | null;
  // Pilot operations
  addPilot: (pilot: Partial<Pilot>) => Pilot;
  updatePilot: (id: string, pilot: Partial<Pilot>) => Pilot | null;
  deletePilot: (id: string) => void;
  getPilot: (id?: string) => Pilot | Pilot[] | null;
  // Flight operations
  addFlight: (flight: Partial<Flight>) => Flight;
  updateFlight: (id: string, flight: Partial<Flight>) => Flight | null;
  deleteFlight: (id: string) => void;
  getFlight: (id?: string) => Flight | Flight[] | null;
  // Clear all data
  clearAllData: () => void;
}

const defaultData: AnonymousData = {
  aircraft: [],
  pilots: [],
  flights: [],
};

const AnonymousContext = createContext<AnonymousContextType | undefined>(undefined);

const ANONYMOUS_MODE_KEY = 'loggerai-anonymous-mode';

export function AnonymousProvider({ children }: { children: React.ReactNode }) {
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [data, setData] = useState<AnonymousData>(defaultData);

  // Check for anonymous mode on mount (client-side only)
  useEffect(() => {
    const stored = sessionStorage.getItem(ANONYMOUS_MODE_KEY);
    if (stored === 'true') {
      setIsAnonymous(true);
    }
  }, []);

  const setAnonymous = useCallback((value: boolean) => {
    setIsAnonymous(value);
    if (value) {
      sessionStorage.setItem(ANONYMOUS_MODE_KEY, 'true');
    } else {
      sessionStorage.removeItem(ANONYMOUS_MODE_KEY);
      setData(defaultData); // Clear data when exiting anonymous mode
    }
  }, []);

  // Aircraft operations
  const addAircraft = useCallback((aircraft: Partial<Aircraft>): Aircraft => {
    const now = new Date().toISOString();
    const newAircraft: Aircraft = {
      _id: generateId(),
      tailNumber: aircraft.tailNumber || '',
      model: aircraft.model || '',
      serial: aircraft.serial || '',
      manufacturer: aircraft.manufacturer || '',
      year: aircraft.year || new Date().getFullYear(),
      maintenanceDates: aircraft.maintenanceDates || {
        annual: now,
        transponder: now,
        staticSystem: now,
      },
      currentHours: aircraft.currentHours || { hobbs: 0, tach: 0 },
      logs: aircraft.logs || [],
      createdAt: now,
      updatedAt: now,
      ...aircraft,
    } as Aircraft;

    setData(prev => ({
      ...prev,
      aircraft: [...prev.aircraft, newAircraft],
    }));

    return newAircraft;
  }, []);

  const updateAircraft = useCallback((id: string, aircraft: Partial<Aircraft>): Aircraft | null => {
    let updated: Aircraft | null = null;
    setData(prev => ({
      ...prev,
      aircraft: prev.aircraft.map(a => {
        if (a._id === id) {
          updated = { ...a, ...aircraft, updatedAt: new Date().toISOString() };
          return updated;
        }
        return a;
      }),
    }));
    return updated;
  }, []);

  const deleteAircraft = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      aircraft: prev.aircraft.filter(a => a._id !== id),
    }));
  }, []);

  const getAircraft = useCallback((id?: string): Aircraft | Aircraft[] | null => {
    if (id) {
      return data.aircraft.find(a => a._id === id) || null;
    }
    return data.aircraft;
  }, [data.aircraft]);

  // Pilot operations
  const addPilot = useCallback((pilot: Partial<Pilot>): Pilot => {
    const now = new Date().toISOString();
    const newPilot: Pilot = {
      _id: generateId(),
      name: pilot.name || '',
      email: pilot.email || '',
      certificates: pilot.certificates || {
        type: 'PPL',
        instrumentRated: false,
        multiEngineRated: false,
      },
      endorsements: pilot.endorsements || [],
      experience: pilot.experience || {
        totalHours: 0,
        picHours: 0,
        nightHours: 0,
        ifrHours: 0,
        last90DaysHours: 0,
        last30DaysHours: 0,
      },
      medicalExpiration: pilot.medicalExpiration || now,
      flightReviewExpiration: pilot.flightReviewExpiration || now,
      createdAt: now,
      updatedAt: now,
      ...pilot,
    } as Pilot;

    setData(prev => ({
      ...prev,
      pilots: [...prev.pilots, newPilot],
    }));

    return newPilot;
  }, []);

  const updatePilot = useCallback((id: string, pilot: Partial<Pilot>): Pilot | null => {
    let updated: Pilot | null = null;
    setData(prev => ({
      ...prev,
      pilots: prev.pilots.map(p => {
        if (p._id === id) {
          updated = { ...p, ...pilot, updatedAt: new Date().toISOString() };
          return updated;
        }
        return p;
      }),
    }));
    return updated;
  }, []);

  const deletePilot = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      pilots: prev.pilots.filter(p => p._id !== id),
    }));
  }, []);

  const getPilot = useCallback((id?: string): Pilot | Pilot[] | null => {
    if (id) {
      return data.pilots.find(p => p._id === id) || null;
    }
    return data.pilots;
  }, [data.pilots]);

  // Flight operations
  const addFlight = useCallback((flight: Partial<Flight>): Flight => {
    const now = new Date().toISOString();
    const newFlight: Flight = {
      _id: generateId(),
      pilot: flight.pilot || '',
      aircraft: flight.aircraft || '',
      scheduledDate: flight.scheduledDate || now,
      departureAirport: flight.departureAirport || '',
      status: flight.status || 'planned',
      legalityChecks: flight.legalityChecks || [],
      overallStatus: flight.overallStatus || 'go',
      emailSent: false,
      createdAt: now,
      updatedAt: now,
      ...flight,
    } as Flight;

    setData(prev => ({
      ...prev,
      flights: [...prev.flights, newFlight],
    }));

    return newFlight;
  }, []);

  const updateFlight = useCallback((id: string, flight: Partial<Flight>): Flight | null => {
    let updated: Flight | null = null;
    setData(prev => ({
      ...prev,
      flights: prev.flights.map(f => {
        if (f._id === id) {
          updated = { ...f, ...flight, updatedAt: new Date().toISOString() };
          return updated;
        }
        return f;
      }),
    }));
    return updated;
  }, []);

  const deleteFlight = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      flights: prev.flights.filter(f => f._id !== id),
    }));
  }, []);

  const getFlight = useCallback((id?: string): Flight | Flight[] | null => {
    if (id) {
      return data.flights.find(f => f._id === id) || null;
    }
    return data.flights;
  }, [data.flights]);

  const clearAllData = useCallback(() => {
    setData(defaultData);
  }, []);

  return (
    <AnonymousContext.Provider
      value={{
        isAnonymous,
        setAnonymous,
        data,
        addAircraft,
        updateAircraft,
        deleteAircraft,
        getAircraft,
        addPilot,
        updatePilot,
        deletePilot,
        getPilot,
        addFlight,
        updateFlight,
        deleteFlight,
        getFlight,
        clearAllData,
      }}
    >
      {children}
    </AnonymousContext.Provider>
  );
}

export function useAnonymous() {
  const context = useContext(AnonymousContext);
  if (context === undefined) {
    throw new Error('useAnonymous must be used within an AnonymousProvider');
  }
  return context;
}

// Utility hook to check if we're in anonymous mode (safe for SSR)
export function useIsAnonymous() {
  const context = useContext(AnonymousContext);
  return context?.isAnonymous ?? false;
}
