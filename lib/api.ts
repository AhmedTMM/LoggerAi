import type { Aircraft, Pilot, Flight, ApiResponse } from '@/lib/types';

const API_BASE = '/api';

async function fetchAPI<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// Aircraft API
export const aircraftApi = {
  getAll: async (): Promise<Aircraft[]> => {
    const data = await fetchAPI<ApiResponse<Aircraft[]>>('/aircraft');
    return data.data || [];
  },

  getById: async (id: string): Promise<Aircraft> => {
    const data = await fetchAPI<ApiResponse<Aircraft>>(`/aircraft/${id}`);
    if (!data.data) throw new Error('Aircraft not found');
    return data.data;
  },

  create: async (aircraft: Partial<Aircraft>): Promise<Aircraft> => {
    const data = await fetchAPI<ApiResponse<Aircraft>>('/aircraft', {
      method: 'POST',
      body: JSON.stringify(aircraft),
    });
    if (!data.data) throw new Error('Failed to create aircraft');
    return data.data;
  },

  update: async (id: string, aircraft: Partial<Aircraft>): Promise<Aircraft> => {
    const data = await fetchAPI<ApiResponse<Aircraft>>(`/aircraft/${id}`, {
      method: 'PUT',
      body: JSON.stringify(aircraft),
    });
    if (!data.data) throw new Error('Failed to update aircraft');
    return data.data;
  },

  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/aircraft/${id}`, { method: 'DELETE' });
  },
};

// Pilot API
export const pilotApi = {
  getAll: async (): Promise<Pilot[]> => {
    const data = await fetchAPI<ApiResponse<Pilot[]>>('/pilots');
    return data.data || [];
  },

  getById: async (id: string): Promise<Pilot> => {
    const data = await fetchAPI<ApiResponse<Pilot>>(`/pilots/${id}`);
    if (!data.data) throw new Error('Pilot not found');
    return data.data;
  },

  create: async (pilot: Partial<Pilot>): Promise<Pilot> => {
    const data = await fetchAPI<ApiResponse<Pilot>>('/pilots', {
      method: 'POST',
      body: JSON.stringify(pilot),
    });
    if (!data.data) throw new Error('Failed to create pilot');
    return data.data;
  },

  update: async (id: string, pilot: Partial<Pilot>): Promise<Pilot> => {
    const data = await fetchAPI<ApiResponse<Pilot>>(`/pilots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(pilot),
    });
    if (!data.data) throw new Error('Failed to update pilot');
    return data.data;
  },

  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/pilots/${id}`, { method: 'DELETE' });
  },
};

// Flight API
export const flightApi = {
  getAll: async (params?: { status?: string; upcoming?: boolean }): Promise<Flight[]> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.upcoming) searchParams.set('upcoming', 'true');
    const query = searchParams.toString();
    const data = await fetchAPI<ApiResponse<Flight[]>>(`/flights${query ? `?${query}` : ''}`);
    return data.data || [];
  },

  getById: async (id: string): Promise<Flight> => {
    const data = await fetchAPI<ApiResponse<Flight>>(`/flights/${id}`);
    if (!data.data) throw new Error('Flight not found');
    return data.data;
  },

  create: async (flight: Partial<Flight>): Promise<Flight> => {
    const data = await fetchAPI<ApiResponse<Flight>>('/flights', {
      method: 'POST',
      body: JSON.stringify(flight),
    });
    if (!data.data) throw new Error('Failed to create flight');
    return data.data;
  },

  update: async (id: string, flight: Partial<Flight>): Promise<Flight> => {
    const data = await fetchAPI<ApiResponse<Flight>>(`/flights/${id}`, {
      method: 'PUT',
      body: JSON.stringify(flight),
    });
    if (!data.data) throw new Error('Failed to update flight');
    return data.data;
  },

  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/flights/${id}`, { method: 'DELETE' });
  },
};

// Audit API
export const auditApi = {
  runFlightAudit: async (flightId: string): Promise<Flight> => {
    const data = await fetchAPI<ApiResponse<Flight>>(`/audit/${flightId}`, {
      method: 'POST',
    });
    if (!data.data) throw new Error('Failed to run audit');
    return data.data;
  },

  sendAuditEmail: async (flightId: string): Promise<{ success: boolean; message: string }> => {
    const data = await fetchAPI<{ success: boolean; message: string }>(
      `/audit/email/${flightId}`,
      { method: 'POST' }
    );
    return data;
  },
};

// Weather API
export const weatherApi = {
  getWeather: async (airport: string): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/weather/${airport}`);
    return data.data;
  },
};

// Document Parsing API
export const documentApi = {
  parseDocument: async (params: {
    fileBase64: string;
    fileType: 'pdf' | 'image';
    documentType: 'logbook' | 'maintenance';
    aircraftId?: string;
    filename?: string;
    background?: boolean;
  }): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>('/parse-document', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data.data;
  },

  fetchAircraftImage: async (aircraftId: string): Promise<{ imageUrl?: string }> => {
    const data = await fetchAPI<ApiResponse<{ imageUrl?: string }>>(
      `/aircraft/${aircraftId}/image`,
      { method: 'POST' }
    );
    return data.data || {};
  },

  // Upload file without parsing - returns immediately
  uploadOnly: async (params: {
    fileBase64: string;
    fileType: 'pdf' | 'image';
    documentType: 'logbook' | 'maintenance' | 'poh' | 'other';
    aircraftId?: string;
    pilotId?: string;
    filename?: string;
  }): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>('/documents/upload', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data.data;
  },

  // Trigger parsing for an uploaded document
  startParsing: async (documentId: string): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/documents/${documentId}/parse`, {
      method: 'POST',
    });
    return data.data;
  },

  // Get parsing progress/status for a document
  getParsingStatus: async (documentId: string): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/documents/${documentId}/parse`);
    return data.data;
  },

  // Stream upload with real-time progress via SSE
  // Returns an async generator that yields progress events
  uploadStream: async function* (params: {
    fileBase64: string;
    fileType: 'pdf' | 'image';
    documentType: 'logbook' | 'maintenance' | 'poh' | 'other';
    aircraftId?: string;
    pilotId?: string;
    filename?: string;
  }): AsyncGenerator<{
    type: 'log' | 'complete' | 'error';
    data: any;
  }> {
    const response = await fetch(`${API_BASE}/documents/upload-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      yield { type: 'error', data: { message: 'Upload failed' } };
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield { type: currentEvent as 'log' | 'complete' | 'error', data };
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  },
};

// Pilot Profile Generation API
export const profileApi = {
  generateFromLogbook: async (params: {
    fileBase64: string;
    fileType: 'pdf' | 'image';
    name?: string;
    email?: string;
    filename?: string;
    createPilot?: boolean;
  }): Promise<any> => {
    const data = await fetchAPI<any>('/pilots/generate-profile', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data;
  },
};

// Parsed Document Management API
export const parsedDocumentApi = {
  getAll: async (params?: { aircraftId?: string; documentType?: string }): Promise<any[]> => {
    const searchParams = new URLSearchParams();
    if (params?.aircraftId) searchParams.set('aircraftId', params.aircraftId);
    if (params?.documentType) searchParams.set('documentType', params.documentType);
    const query = searchParams.toString();
    const data = await fetchAPI<ApiResponse<any[]>>(`/parse-document${query ? `?${query}` : ''}`);
    return data.data || [];
  },

  getById: async (id: string): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/parse-document/${id}`);
    return data.data;
  },

  linkToAircraft: async (docId: string, aircraftId: string | null): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/parse-document/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ aircraftId }),
    });
    return data.data;
  },

  linkToPilot: async (docId: string, pilotId: string | null): Promise<any> => {
    const data = await fetchAPI<ApiResponse<any>>(`/parse-document/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pilotId }),
    });
    return data.data;
  },

  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/parse-document/${id}`, { method: 'DELETE' });
  },
};
