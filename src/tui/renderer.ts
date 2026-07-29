export const ESC = '\x1b';
export const CSI = `${ESC}[`;
export const SGR = (code: number | string) => `${CSI}${code}m`;

export const BOLD = SGR(1);
export const DIM = SGR(2);
export const RESET = SGR(0);

export const BLACK = SGR(30);
export const RED = SGR(31);
export const GREEN = SGR(32);
export const YELLOW = SGR(33);
export const BLUE = SGR(34);
export const MAGENTA = SGR(35);
export const CYAN = SGR(36);
export const WHITE = SGR(37);

export const BG_BLACK = SGR(40);
export const BG_BLUE = SGR(44);
export const BG_CYAN = SGR(46);

export function cursorTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

export function cursorUp(n: number): string {
  return `${CSI}${n}A`;
}

export function cursorDown(n: number): string {
  return `${CSI}${n}B`;
}

export function cursorFwd(n: number): string {
  return `${CSI}${n}C`;
}

export function eraseLine(): string {
  return `${CSI}K`;
}

export function eraseDown(): string {
  return `${CSI}J`;
}

export function hideCursor(): string {
  return `${CSI}?25l`;
}

export function showCursor(): string {
  return `${CSI}?25h`;
}

export function getSize(): { rows: number; cols: number } {
  const { rows, columns } = Deno.consoleSize();
  return { rows, cols: columns };
}

export function write(raw: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(raw));
}

export function writeln(raw: string): void {
  write(raw + '\n');
}

export function renderStatusBar(
  cols: number,
  iteration: number,
  maxIterations: number,
  currentTool: string,
  elapsed: string,
  status: string,
): string {
  const left = `${DIM}aur${RESET} ${BOLD}iter ${iteration}/${maxIterations}${RESET}${DIM} │ ${RESET}${currentTool ? `⚡${currentTool}${DIM} │ ${RESET}` : ''}`;
  const right = `${DIM}${elapsed}${RESET}  ${status}`;
  const pad = cols - visibleLength(left) - visibleLength(right) - 2;
  return `${cursorTo(0, 1)}${left}${' '.repeat(Math.max(0, pad))}${right}`;
}

export function renderHeaderBar(
  cols: number,
  task: string,
  model: string,
): string {
  const left = `${BG_BLUE}${WHITE}${BOLD} AurAgent ${RESET} ${CYAN}${BOLD}${task}${RESET}`;
  const right = `${DIM}${model}${RESET}`;
  const pad = cols - visibleLength(left) - visibleLength(right) - 2;
  return `${cursorTo(1, 1)}${left}${' '.repeat(Math.max(0, pad))}${right}`;
}

export function visibleLength(text: string): number {
  let len = 0;
  let inEscape = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\x1b') {
      inEscape = true;
      continue;
    }
    if (inEscape) {
      if (text[i] === 'm' || text[i] === 'H' || text[i] === 'A' ||
          text[i] === 'B' || text[i] === 'C' || text[i] === 'K' ||
          text[i] === 'J' || text[i] === 'h' || text[i] === 'l') {
        inEscape = false;
      }
      continue;
    }
    len++;
  }
  return len;
}

export function truncateLine(line: string, maxLen: number): string {
  const len = visibleLength(line);
  if (len <= maxLen) return line;
  let out = '';
  let visLen = 0;
  let inEscape = false;
  for (const ch of line) {
    if (ch === '\x1b') { inEscape = true; out += ch; continue; }
    if (inEscape) { out += ch; if (ch === 'm') inEscape = false; continue; }
    if (visLen >= maxLen - 1) { out += '…'; break; }
    out += ch;
    visLen++;
  }
  return out;
}

export const ITEM_ICON = '■';
export const TOOL_ICON = '▶';
export const OK_ICON = '✔';
export const FAIL_ICON = '✘';
export const WARN_ICON = '⚠';
