/**
 * Flight status display configuration.
 *
 * Centralises the GO / CAUTION / NO-GO status presentation (emoji, label,
 * color) used by the email service and other UI-facing code.  Previously
 * lived in documentProcessingUtils alongside unrelated document-processing
 * logic.
 */

export type FlightStatusType = 'go' | 'caution' | 'no-go';

export interface StatusConfig {
  emoji: string;
  text: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  isDangerous: boolean;
}

const STATUS_CONFIG: Record<FlightStatusType, StatusConfig> = {
  'go': {
    emoji: '✅',
    text: 'GO - Flight Approved',
    shortLabel: 'GO',
    color: '#10b981',
    bgColor: '#ecfdf5',
    isDangerous: false,
  },
  'caution': {
    emoji: '⚠️',
    text: 'CAUTION - Review Required',
    shortLabel: 'CAUTION',
    color: '#f59e0b',
    bgColor: '#fffbeb',
    isDangerous: true,
  },
  'no-go': {
    emoji: '❌',
    text: 'NO-GO - Flight Not Recommended',
    shortLabel: 'NO-GO',
    color: '#ef4444',
    bgColor: '#fef2f2',
    isDangerous: true,
  },
};

export function getStatusConfig(status: FlightStatusType | string): StatusConfig {
  return STATUS_CONFIG[status as FlightStatusType] || STATUS_CONFIG['no-go'];
}
