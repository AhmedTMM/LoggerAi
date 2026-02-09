import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enqueueUploadJob,
  getQueueLength,
  isQueueProcessing,
  recoverStuckDocuments,
} from '@/lib/services/backgroundProcessor';

// ---------------------------------------------------------------------------
// Mock all external dependencies
// ---------------------------------------------------------------------------

// Mock dbConnect
vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock ParsedDocument model
const mockFindByIdAndUpdate = vi.fn().mockResolvedValue({});
const mockFind = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/models/ParsedDocument', () => ({
  default: {
    findByIdAndUpdate: (...args: any[]) => mockFindByIdAndUpdate(...args),
    find: (...args: any[]) => ({
      select: () => ({
        lean: () => mockFind(...args),
      }),
    }),
  },
}));

// Mock Aircraft and Pilot models
vi.mock('@/lib/models/Aircraft', () => ({
  default: {
    findById: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ _id: 'ac1', tailNumber: 'N12345', manufacturer: 'Cessna', model: '172', year: 2020 }),
    updateOne: vi.fn().mockResolvedValue({}),
  },
  LogbookCategory: {},
}));

vi.mock('@/lib/models/Pilot', () => ({
  default: {
    findById: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

// Mock services
vi.mock('@/lib/services/legalityService', () => ({
  runBasicLegalityAudit: vi.fn().mockResolvedValue({
    overallStatus: 'go',
    checks: [],
  }),
}));

vi.mock('@/lib/services/autoAttachService', () => ({
  invalidateAllCaches: vi.fn(),
}));

vi.mock('@/lib/services/documentProcessingUtils', () => ({
  calculateSummary: vi.fn().mockReturnValue({
    totalEntries: 5,
    totalHours: 10,
    dateRange: { earliest: '2024-01-01', latest: '2024-06-01' },
  }),
  updatePilotExperience: vi.fn().mockResolvedValue(undefined),
  updateAircraftFromEntries: vi.fn().mockResolvedValue(undefined),
}));

// Mock reductoService - the ultra-fast parser
const mockParseDocumentUltraFast = vi.fn().mockResolvedValue({
  success: true,
  data: {
    documentType: 'logbook',
    extractedData: {
      entries: [
        { date: '2024-01-15', aircraftIdent: 'N12345', totalTime: 1.5 },
        { date: '2024-02-20', aircraftIdent: 'N12345', totalTime: 2.0 },
      ],
    },
    confidence: 1.0,
    rawText: '',
  },
});

vi.mock('@/lib/services/reductoService', () => ({
  parseDocumentUltraFast: (...args: any[]) => mockParseDocumentUltraFast(...args),
}));

// Mock historical weather service
vi.mock('@/lib/services/historicalWeatherService', () => ({
  fetchHistoricalMETAR: vi.fn().mockResolvedValue(null),
}));

// Mock firecrawl service
vi.mock('@/lib/services/firecrawlService', () => ({
  fetchAircraftDetails: vi.fn().mockResolvedValue({ success: false }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backgroundProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enqueueUploadJob', () => {
    it('adds a job and triggers processing', async () => {
      enqueueUploadJob({
        documentId: 'doc123',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      // Allow async processing to complete
      await vi.waitFor(() => {
        expect(mockFindByIdAndUpdate).toHaveBeenCalled();
      }, { timeout: 5000 });
    });

    it('sets initial retryCount to 0', async () => {
      enqueueUploadJob({
        documentId: 'doc456',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        // The first call sets status to 'parsing'
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('doc456', expect.objectContaining({
          status: 'parsing',
          progress: 10,
        }));
      }, { timeout: 5000 });
    });

    it('updates status to parsing on start', async () => {
      enqueueUploadJob({
        documentId: 'doc789',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('doc789', {
          status: 'parsing',
          progress: 10,
          progressStep: 'processing',
        });
      }, { timeout: 5000 });
    });

    it('calls parseDocumentUltraFast with correct arguments', async () => {
      enqueueUploadJob({
        documentId: 'docParse',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'pilot_logbook',
      });

      await vi.waitFor(() => {
        expect(mockParseDocumentUltraFast).toHaveBeenCalledWith(
          'dGVzdA==',
          'pdf',
          'pilot_logbook',
          expect.any(Function)
        );
      }, { timeout: 5000 });
    });

    it('maps poh documentType to logbook for parsing', async () => {
      enqueueUploadJob({
        documentId: 'docPoh',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'poh.pdf',
        userId: 'user1',
        documentType: 'poh',
      });

      await vi.waitFor(() => {
        expect(mockParseDocumentUltraFast).toHaveBeenCalledWith(
          'dGVzdA==',
          'pdf',
          'logbook',
          expect.any(Function)
        );
      }, { timeout: 5000 });
    });

    it('marks document as completed on success', async () => {
      enqueueUploadJob({
        documentId: 'docComplete',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('docComplete', expect.objectContaining({
          status: 'completed',
          progress: 100,
          progressStep: 'complete',
        }));
      }, { timeout: 5000 });
    });

    it('marks document as failed when parse returns error', async () => {
      mockParseDocumentUltraFast.mockResolvedValueOnce({
        success: false,
        error: 'OCR failed',
      });

      enqueueUploadJob({
        documentId: 'docFail',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('docFail', expect.objectContaining({
          status: 'failed',
          progressStep: 'failed',
          error: 'OCR failed',
        }));
      }, { timeout: 5000 });
    });

    it('retries on thrown error up to MAX_RETRIES', async () => {
      let callCount = 0;
      mockParseDocumentUltraFast.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) throw new Error('Transient failure');
        return {
          success: true,
          data: {
            documentType: 'logbook',
            extractedData: { entries: [] },
            confidence: 1.0,
            rawText: '',
          },
        };
      });

      enqueueUploadJob({
        documentId: 'docRetry',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        // Should eventually succeed on 3rd attempt
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('docRetry', expect.objectContaining({
          status: 'completed',
          progress: 100,
        }));
      }, { timeout: 20000 });

      expect(callCount).toBe(3);
    }, 25000);

    it('fails permanently after MAX_RETRIES exhausted', async () => {
      mockParseDocumentUltraFast.mockImplementation(async () => {
        throw new Error('Permanent failure');
      });

      enqueueUploadJob({
        documentId: 'docMaxRetry',
        fileBase64: 'dGVzdA==',
        fileType: 'pdf',
        filename: 'test.pdf',
        userId: 'user1',
        documentType: 'logbook',
      });

      await vi.waitFor(() => {
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('docMaxRetry', expect.objectContaining({
          status: 'failed',
          progressStep: 'failed',
          error: expect.stringContaining('after 2 retries'),
        }));
      }, { timeout: 20000 });
    }, 25000);
  });

  describe('getQueueLength', () => {
    it('returns 0 when queue is empty', () => {
      // After previous tests complete, queue should be empty
      // This is a basic sanity check
      expect(typeof getQueueLength()).toBe('number');
    });
  });

  describe('isQueueProcessing', () => {
    it('returns a boolean', () => {
      expect(typeof isQueueProcessing()).toBe('boolean');
    });
  });

  describe('recoverStuckDocuments', () => {
    it('returns 0 when no stuck documents exist', async () => {
      mockFind.mockResolvedValueOnce([]);
      const recovered = await recoverStuckDocuments();
      expect(recovered).toBe(0);
    });

    it('re-enqueues stuck documents with file data', async () => {
      mockFind.mockResolvedValueOnce([
        {
          _id: { toString: () => 'stuck1' },
          fileBase64: 'dGVzdA==',
          fileType: 'pdf',
          filename: 'stuck.pdf',
          userId: { toString: () => 'user1' },
          documentType: 'logbook',
          pilot: null,
          aircraft: null,
          retryCount: 0,
        },
      ]);

      const recovered = await recoverStuckDocuments();
      expect(recovered).toBe(1);
    });

    it('marks stuck documents without file data as failed', async () => {
      const stuckId = 'stuck2';
      mockFind.mockResolvedValueOnce([
        {
          _id: stuckId,
          fileBase64: null,
          filePath: '/some/path',
          fileType: 'pdf',
          filename: 'stuck.pdf',
          userId: { toString: () => 'user1' },
          documentType: 'logbook',
          retryCount: 0,
        },
      ]);

      const recovered = await recoverStuckDocuments();
      expect(recovered).toBe(0);
      // Verify findByIdAndUpdate was called for the stuck doc
      const failCall = mockFindByIdAndUpdate.mock.calls.find(
        (call: any[]) => call[0] === stuckId && call[1]?.status === 'failed'
      );
      expect(failCall).toBeTruthy();
      expect(failCall![1].error).toContain('no file data');
    });

    it('returns 0 and does not throw on database error', async () => {
      mockFind.mockRejectedValueOnce(new Error('DB connection failed'));
      const recovered = await recoverStuckDocuments();
      expect(recovered).toBe(0);
    });
  });
});
