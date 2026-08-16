import printerContent from '../content/printer.json';

/** Typed access to printer.json. Same cast pattern as FAX_TEXT and NPC_TEXT. */
interface PrinterContent {
  window: Record<string, string>;
  lcd: Record<string, string>;
  outcome: Record<string, string[]>;
  ticket: Record<string, string>;
}

export const PRINTER_TEXT = printerContent as unknown as PrinterContent;

/** Dev-only: every code the machine can emit must have a line, or the LCD shows
 *  a raw key — which is exactly the bug the fax shipped with `checkTray`. */
export function assertPrinterContentIntegrity(codes: readonly string[]): string[] {
  const problems: string[] = [];
  for (const code of codes) {
    if (!PRINTER_TEXT.lcd[code]) problems.push(`printer.json: lcd missing "${code}"`);
  }
  for (const pool of Object.keys(PRINTER_TEXT.outcome)) {
    if ((PRINTER_TEXT.outcome[pool] ?? []).length === 0) {
      // rng.pick throws on an empty list, and that throw inside a modal with the
      // clock held is an unrecoverable soft lock.
      problems.push(`printer.json: outcome."${pool}" is empty`);
    }
  }
  return problems;
}

/** Every LCD code src/sim/printer.ts can produce. */
export const PRINTER_CODES = [
  'code.tray', 'code.registration', 'code.fuser', 'code.exit',
  'at.tray', 'at.registration', 'at.fuser', 'at.exit',
  'read.nothing', 'read.edgeFree', 'read.goesInFurther',
  'torn', 'tornNothing', 'tornBlind', 'cleared', 'shredded', 'abandoned',
] as const;
