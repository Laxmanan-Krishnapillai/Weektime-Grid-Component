import { deflate, inflate } from 'pako';
import { createParser, parseAsInteger, parseAsStringEnum } from 'nuqs';
import { DateTime } from 'luxon';
import type { NominationDirection } from './types';
import { toWeekStart } from './time';

const MAX_URL_LENGTH = 1500;

type DiffRun = [number, number, number];

interface DiffPayloadV1 {
  v: 1;
  runs: DiffRun[];
}

type DiffPayload = DiffPayloadV1;

function toBase64(bytes: Uint8Array): string {
  if (typeof window === 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(serialized: string): Uint8Array {
  if (typeof window === 'undefined') {
    return Buffer.from(serialized, 'base64');
  }
  const binary = atob(serialized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeDiff(values: number[]): string | null {
  const runs: DiffRun[] = [];
  let i = 0;
  while (i < values.length) {
    const start = i;
    const value = values[i];
    let length = 1;
    i += 1;
    while (i < values.length && values[i] === value) {
      length += 1;
      i += 1;
    }
    if (value !== 0) {
      runs.push([start, length, value]);
    }
  }

  const payload: DiffPayload = { v: 1, runs };
  const json = JSON.stringify(payload);
  const compressed = deflate(json) as Uint8Array;
  const base64 = toBase64(compressed);
  if (base64.length > MAX_URL_LENGTH) {
    return null;
  }
  return base64;
}

export function decodeDiff(serialized: string | null, totalSteps: number): number[] {
  const values = new Array<number>(totalSteps).fill(0);
  if (!serialized) {
    return values;
  }
  try {
    const buffer = fromBase64(serialized);
    const inflated = inflate(buffer, { to: 'string' }) as string;
    const parsed = JSON.parse(inflated) as DiffPayload;
    if (parsed.v !== 1) {
      return values;
    }
    parsed.runs.forEach(([start, length, value]) => {
      for (let offset = 0; offset < length; offset += 1) {
        const index = start + offset;
        if (index < values.length) {
          values[index] = value;
        }
      }
    });
  } catch (error) {
    console.error('Failed to decode diff payload', error);
    return values;
  }
  return values;
}

export const weekParser = createParser({
  parse: (value: string | null) =>
    value ? toWeekStart(DateTime.fromISO(value, { zone: 'utc' })).setZone('Europe/Copenhagen') : null,
  serialize: (value: DateTime | null) => (value ? value.toUTC().toISO() ?? null : null),
});

export const directionParser = parseAsStringEnum(['entry', 'exit'] as const satisfies NominationDirection[]);

export const resolutionParser = createParser<number>({
  parse: (value) => {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return [5, 15, 30, 60].includes(parsed) ? parsed : null;
  },
  serialize: (value) => (value ? value.toString() : null),
});

export const leadTimeParser = parseAsInteger.withDefault(2);

export const diffParser = createParser<string>({
  parse: (value) => value,
  serialize: (value) => value,
});
