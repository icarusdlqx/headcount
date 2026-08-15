import faxContent from '../content/fax.json';
import type { FaxFunction } from '../sim/faxMachine';
import type { JobOwner } from '../sim/faxTray';

/**
 * Typed access to fax.json, plus the small amount of presentation logic that is
 * genuinely a view concern. resolveJsonModule widens these maps, so the cast is
 * required rather than lazy — same pattern as the flavour table.
 */

interface FaxContent {
  window: Record<string, string>;
  lcd: { terse: Record<string, string>; verbose: Record<string, string> };
  recipients: Record<string, string>;
  colleagues: Record<string, string>;
  owners: Record<string, string>;
  tray: Record<string, string[]>;
  outcome: Record<string, string[]>;
  departments: string[];
}

const RAW = faxContent as unknown as FaxContent;

/** The strip that gets stuck under a key once its fact is known. */
const KEY_LABELS: Record<FaxFunction, string> = {
  line: 'LINE',
  feed: 'FEED',
  fine: 'FINE',
  copy: 'COPY',
  redial: 'REDIAL',
  speaker: 'SPKR',
};

export const FAX_TEXT = {
  ...RAW,
  keyLabels: KEY_LABELS,
  trayLabels: { fax: 'FAX', notFax: 'NOT FAX' },
};

export function ownerDisplay(owner: JobOwner, colleagueName: string | null): string {
  if (owner === 'colleague' && colleagueName) return colleagueName;
  return RAW.owners[owner] ?? owner;
}

/**
 * Dev-only: every LCD code the machine can emit must exist in BOTH maps, or the
 * speaker key turns a line of feedback into a raw code key on screen. Same
 * posture as the day-end content check.
 */
export function assertFaxContentIntegrity(codes: readonly string[]): string[] {
  const problems: string[] = [];
  for (const code of codes) {
    if (!RAW.lcd.terse[code]) problems.push(`fax.json: lcd.terse missing "${code}"`);
    if (!RAW.lcd.verbose[code]) problems.push(`fax.json: lcd.verbose missing "${code}"`);
  }
  for (const pool of Object.keys(RAW.outcome)) {
    if ((RAW.outcome[pool] ?? []).length === 0) problems.push(`fax.json: outcome."${pool}" is empty`);
  }
  // rng.pick throws on an empty list, and that throw would land inside a modal
  // scene with the clock held — straight into an unrecoverable soft lock.
  if (RAW.departments.length === 0) problems.push('fax.json: departments is empty');
  return problems;
}

/** Every code faxMachine.ts can put on the LCD. Kept beside the content it checks. */
export const LCD_CODES = [
  'ready',
  'checkTray',
  'noDoc',
  'noLine',
  'noNumber',
  'alreadyLine',
  'lineOk',
  'docLoaded',
  'dialing',
  'fineOn',
  'fineOff',
  'copying',
  'redialEmpty',
  'speakerOn',
  'speakerOff',
  'busy',
  'jam',
  'jamHint',
  'jamForeign',
  'ok',
  'cancelled',
] as const;
