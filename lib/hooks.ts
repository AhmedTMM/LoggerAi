'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aircraftApi, pilotApi, flightApi, auditApi, weatherApi, documentApi, parsedDocumentApi, profileApi } from './api';
import { useAnonymous } from './anonymous-context';
import type { Aircraft, Pilot, Flight, WeatherData } from './types';

// Aircraft Hooks
export function useAircraft() {
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

export function useAircraftById(id: string) {
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

export function useCreateAircraft() {
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

export function useUpdateAircraft() {
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

export function useDeleteAircraft() {
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

// Pilot Hooks
export function usePilots() {
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

export function usePilotById(id: string) {
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

export function useCreatePilot() {
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

export function useUpdatePilot() {
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

export function useDeletePilot() {
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

export function useApplyLogbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pilotId, documentId, action }: { pilotId: string; documentId: string; action?: 'add' | 'remove' }) => {
      const res = await fetch(`/api/pilots/${pilotId}/apply-logbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, action }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
    },
  });
}

// Flight Hooks
export function useFlights(params?: { status?: string; upcoming?: boolean; pilotId?: string }) {
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

export function useFlightsByPilot(pilotId: string | undefined) {
  const { isAnonymous, data } = useAnonymous();

  return useQuery({
    queryKey: ['flights', 'byPilot', pilotId, { anonymous: isAnonymous }],
    queryFn: async () => {
      if (isAnonymous) {
        return data.flights.filter(f => {
          const flightPilotId = typeof f.pilot === 'string' ? f.pilot : f.pilot?._id;
          return flightPilotId === pilotId;
        });
      }
      return flightApi.getAll({ pilotId });
    },
    enabled: !!pilotId,
    staleTime: isAnonymous ? 0 : 2 * 60 * 1000,
    gcTime: isAnonymous ? 0 : 15 * 60 * 1000,
  });
}

export function useFlightById(id: string) {
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

export function useCreateFlight() {
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

export function useUpdateFlight() {
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

export function useDeleteFlight() {
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

export function useRunFlightAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flightId: string) => auditApi.runFlightAudit(flightId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
      queryClient.setQueryData(['flights', data._id], data);
    },
  });
}

export function useSendAuditEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flightId: string) => auditApi.sendAuditEmail(flightId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
    },
  });
}

// Weather Hooks
export function useWeather(airport: string) {
  return useQuery({
    queryKey: ['weather', airport],
    queryFn: () => weatherApi.getWeather(airport),
    enabled: !!airport && airport.length >= 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}

// Document Parsing Hooks
export function useParseDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      fileBase64: string;
      fileType: 'pdf' | 'image';
      documentType: 'logbook' | 'maintenance';
      aircraftId?: string;
      pilotId?: string;
      filename?: string;
      background?: boolean;
    }) => documentApi.parseDocument(params),
    onSuccess: (_, variables) => {
      if (variables.aircraftId) {
        queryClient.invalidateQueries({ queryKey: ['aircraft'] });
      }
      if (variables.pilotId) {
        queryClient.invalidateQueries({ queryKey: ['pilots'] });
      }
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
    },
  });
}

// Aircraft Image Fetch Hook
export function useFetchAircraftImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (aircraftId: string) => documentApi.fetchAircraftImage(aircraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

// Generate/Regenerate Safety Analysis Hook (Aircraft)
export function useGenerateSafetyAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (aircraftId: string) => {
      const res = await fetch(`/api/aircraft/${aircraftId}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

// Generate/Regenerate Safety Analysis Hook (Pilot)
export function useGeneratePilotSafetyAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pilotId: string) => {
      const res = await fetch(`/api/pilots/${pilotId}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

// Upload document without parsing - for large files
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      fileBase64: string;
      fileType: 'pdf' | 'image';
      documentType: 'logbook' | 'maintenance' | 'poh' | 'other';
      aircraftId?: string;
      pilotId?: string;
      filename?: string;
    }) => documentApi.uploadOnly(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
    },
  });
}

// Trigger parsing for an uploaded document
export function useStartParsing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentApi.startParsing(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

// Parsed Documents Hooks
export function useParsedDocuments(params?: { aircraftId?: string; pilotId?: string; documentType?: string }) {
  return useQuery({
    queryKey: ['parsedDocuments', params],
    queryFn: () => parsedDocumentApi.getAll(params),
  });
}

export function useParsedDocumentById(id: string) {
  return useQuery({
    queryKey: ['parsedDocuments', id],
    queryFn: () => parsedDocumentApi.getById(id),
    enabled: !!id,
  });
}

export function useLinkDocToAircraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ docId, aircraftId }: { docId: string; aircraftId: string | null }) =>
      parsedDocumentApi.linkToAircraft(docId, aircraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

export function useLinkDocToPilot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ docId, pilotId }: { docId: string; pilotId: string | null }) =>
      parsedDocumentApi.linkToPilot(docId, pilotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

export function useDeleteParsedDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => parsedDocumentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
    },
  });
}

// Pilot Profile Generation Hook
export function useGeneratePilotProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      fileBase64: string;
      fileType: 'pdf' | 'image';
      name?: string;
      email?: string;
      filename?: string;
      createPilot?: boolean;
    }) => profileApi.generateFromLogbook(params),
    onSuccess: (data, variables) => {
      if (variables.createPilot && data.pilot) {
        queryClient.invalidateQueries({ queryKey: ['pilots'] });
        queryClient.invalidateQueries({ queryKey: ['parsedDocuments'] });
      }
    },
  });
}

// Weather Experience Cache Hook
// Stores weather experience data on the client for use in safety analysis
export interface WeatherExperienceData {
  pilotId: string;
  totalFlights: number;
  flightsWithWeather: number;
  vfr: number;
  mvfr: number;
  ifr: number;
  lifr: number;
  lastUpdated: Date;
}

export function usePilotWeatherExperience(pilotId: string | undefined) {
  return useQuery({
    queryKey: ['pilotWeatherExperience', pilotId],
    queryFn: async () => {
      if (!pilotId) return null;

      // Fetch from the new weather experience endpoint
      const res = await fetch(`/api/pilots/${pilotId}/weather-experience`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch weather experience');
      }

      return data.weatherExperience as WeatherExperienceData;
    },
    enabled: !!pilotId,
    staleTime: 10 * 60 * 1000, // 10 minutes - weather experience doesn't change often
    gcTime: 60 * 60 * 1000, // 1 hour cache
  });
}

// Update pilot weather experience cache
export function useUpdatePilotWeatherExperience() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pilotId: string;
      weatherExperience: Omit<WeatherExperienceData, 'pilotId'>;
    }) => {
      const res = await fetch(`/api/pilots/${params.pilotId}/weather-experience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.weatherExperience),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pilotWeatherExperience', variables.pilotId] });
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

// Generate pilot safety analysis with weather data
export function useGeneratePilotSafetyAnalysisWithWeather() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pilotId: string;
      weatherExperience?: WeatherExperienceData;
    }) => {
      const res = await fetch(`/api/pilots/${params.pilotId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherExperience: params.weatherExperience }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}
