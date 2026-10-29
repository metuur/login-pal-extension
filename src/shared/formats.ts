import type { AccountFormat } from './types';

export interface FormatDescriptor {
  extension: string;
  mime: string;
  label: string;
  unit: 'row' | 'record';
}

export const FORMATS: Record<AccountFormat, FormatDescriptor> = {
  csv: { extension: '.csv', mime: 'text/csv', label: 'CSV', unit: 'row' },
  json: { extension: '.json', mime: 'application/json', label: 'JSON', unit: 'record' },
};
