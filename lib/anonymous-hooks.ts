'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAnonymous } from './anonymous-context';
import { aircraftApi, pilotApi, flightApi } from './api';
import type { Aircraft, Pilot, Flight } from './types';

// Anonymous-aware Aircraft Hooks
export function useAircraftAnonymous() {
  const { isAnonymous, data } = useAnonymous();

  return useQuery({
    queryKey: ['aircraft', { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return data.aircraft;
      }
      return aircraftApi.getAll();
    },
    staleTime: isAnonymous ? 0 : 5 * 60 * 1000,
    gcTime: isAnonymous ? 0 : 30 * 60 * 1000,
  });
}

export function useAircraftByIdAnonymous(id: string) {
  const { isAnonymous, getAircraft } = useAnonymous();

  return useQuery({
    queryKey: ['aircraft', id, { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return getAircraft(id) as Aircraft | null;
      }
      return aircraftApi.getById(id);
    },
    enabled: !!id,
  });
}

export function useCreateAircraftAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, addAircraft } = useAnonymous();

  return useMutation({
    mutationFn: async (aircraft: Partial<Aircraft>) => {
      if (isAnonymous) {
        return addAircraft(aircraft);
      }
      return aircraftApi.create(aircraft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

export function useUpdateAircraftAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, updateAircraft } = useAnonymous();

  return useMutation({
    mutationFn: async ({ id, aircraft }: { id: string; aircraft: Partial<Aircraft> }) => {
      if (isAnonymous) {
        return updateAircraft(id, aircraft);
      }
      return aircraftApi.update(id, aircraft);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
      if (data) {
        queryClient.setQueryData(['aircraft', data._id], data);
      }
    },
  });
}

export function useDeleteAircraftAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, deleteAircraft } = useAnonymous();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAnonymous) {
        deleteAircraft(id);
        return;
      }
      return aircraftApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

// Anonymous-aware Pilot Hooks
export function usePilotsAnonymous() {
  const { isAnonymous, data } = useAnonymous();

  return useQuery({
    queryKey: ['pilots', { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return data.pilots;
      }
      return pilotApi.getAll();
    },
    staleTime: isAnonymous ? 0 : 5 * 60 * 1000,
    gcTime: isAnonymous ? 0 : 30 * 60 * 1000,
  });
}

export function usePilotByIdAnonymous(id: string) {
  const { isAnonymous, getPilot } = useAnonymous();

  return useQuery({
    queryKey: ['pilots', id, { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return getPilot(id) as Pilot | null;
      }
      return pilotApi.getById(id);
    },
    enabled: !!id,
  });
}

export function useCreatePilotAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, addPilot } = useAnonymous();

  return useMutation({
    mutationFn: async (pilot: Partial<Pilot>) => {
      if (isAnonymous) {
        return addPilot(pilot);
      }
      return pilotApi.create(pilot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

export function useUpdatePilotAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, updatePilot } = useAnonymous();

  return useMutation({
    mutationFn: async ({ id, pilot }: { id: string; pilot: Partial<Pilot> }) => {
      if (isAnonymous) {
        return updatePilot(id, pilot);
      }
      return pilotApi.update(id, pilot);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
      if (data) {
        queryClient.setQueryData(['pilots', data._id], data);
      }
    },
  });
}

export function useDeletePilotAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, deletePilot } = useAnonymous();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAnonymous) {
        deletePilot(id);
        return;
      }
      return pilotApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

// Anonymous-aware Flight Hooks
export function useFlightsAnonymous(params?: { status?: string; upcoming?: boolean; pilotId?: string }) {
  const { isAnonymous, data } = useAnonymous();

  return useQuery({
    queryKey: ['flights', params, { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        let flights = data.flights;
        if (params?.pilotId) {
          flights = flights.filter(f => {
            const pilotId = typeof f.pilot === 'string' ? f.pilot : f.pilot?._id;
            return pilotId === params.pilotId;
          });
        }
        if (params?.status) {
          flights = flights.filter(f => f.status === params.status);
        }
        return flights;
      }
      return flightApi.getAll(params);
    },
    staleTime: isAnonymous ? 0 : 2 * 60 * 1000,
    gcTime: isAnonymous ? 0 : 15 * 60 * 1000,
  });
}

export function useFlightByIdAnonymous(id: string) {
  const { isAnonymous, getFlight } = useAnonymous();

  return useQuery({
    queryKey: ['flights', id, { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return getFlight(id) as Flight | null;
      }
      return flightApi.getById(id);
    },
    enabled: !!id,
  });
}

export function useCreateFlightAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, addFlight } = useAnonymous();

  return useMutation({
    mutationFn: async (flight: Partial<Flight>) => {
      if (isAnonymous) {
        return addFlight(flight);
      }
      return flightApi.create(flight);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
    },
  });
}

export function useUpdateFlightAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, updateFlight } = useAnonymous();

  return useMutation({
    mutationFn: async ({ id, flight }: { id: string; flight: Partial<Flight> }) => {
      if (isAnonymous) {
        return updateFlight(id, flight);
      }
      return flightApi.update(id, flight);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
      if (data) {
        queryClient.setQueryData(['flights', data._id], data);
      }
    },
  });
}

export function useDeleteFlightAnonymous() {
  const queryClient = useQueryClient();
  const { isAnonymous, deleteFlight } = useAnonymous();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isAnonymous) {
        deleteFlight(id);
        return;
      }
      return flightApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
    },
  });
}
