'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aircraftApi, pilotApi, flightApi, auditApi, weatherApi, documentApi, parsedDocumentApi, profileApi } from './api';
import type { Aircraft, Pilot, Flight, WeatherData } from './types';

// Aircraft Hooks
export function useAircraft() {
  return useQuery({
    queryKey: ['aircraft'],
    queryFn: aircraftApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useAircraftById(id: string) {
  return useQuery({
    queryKey: ['aircraft', id],
    queryFn: () => aircraftApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateAircraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (aircraft: Partial<Aircraft>) => aircraftApi.create(aircraft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

export function useUpdateAircraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, aircraft }: { id: string; aircraft: Partial<Aircraft> }) =>
      aircraftApi.update(id, aircraft),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
      queryClient.setQueryData(['aircraft', data._id], data);
    },
  });
}

export function useDeleteAircraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => aircraftApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aircraft'] });
    },
  });
}

// Pilot Hooks
export function usePilots() {
  return useQuery({
    queryKey: ['pilots'],
    queryFn: pilotApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function usePilotById(id: string) {
  return useQuery({
    queryKey: ['pilots', id],
    queryFn: () => pilotApi.getById(id),
    enabled: !!id,
  });
}

export function useCreatePilot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pilot: Partial<Pilot>) => pilotApi.create(pilot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
    },
  });
}

export function useUpdatePilot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, pilot }: { id: string; pilot: Partial<Pilot> }) =>
      pilotApi.update(id, pilot),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pilots'] });
      queryClient.setQueryData(['pilots', data._id], data);
    },
  });
}

export function useDeletePilot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pilotApi.delete(id),
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
export function useFlights(params?: { status?: string; upcoming?: boolean }) {
  return useQuery({
    queryKey: ['flights', params],
    queryFn: () => flightApi.getAll(params),
    staleTime: 2 * 60 * 1000, // 2 minutes (flights change more often)
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

export function useFlightById(id: string) {
  return useQuery({
    queryKey: ['flights', id],
    queryFn: () => flightApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateFlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flight: Partial<Flight>) => flightApi.create(flight),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
    },
  });
}

export function useUpdateFlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, flight }: { id: string; flight: Partial<Flight> }) =>
      flightApi.update(id, flight),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flights'] });
      queryClient.setQueryData(['flights', data._id], data);
    },
  });
}

export function useDeleteFlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => flightApi.delete(id),
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
export function useParsedDocuments(params?: { aircraftId?: string; documentType?: string }) {
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
