const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

export function clearScreen(): void {
  console.clear();
}

export function printHeader(): void {
  console.log(`${BOLD}${CYAN}━━━ Aur Watch ━━━${RESET}`);
  console.log(
    `${BOLD}Monitorando alterações em arquivos... (Ctrl+C para parar)${RESET}\n`,
  );
}

export function printChange(path: string): void {
  console.log(
    `  ${YELLOW}⚡${RESET} ${BOLD}${path}${RESET}`,
  );
}

export function printRunStart(task: string): void {
  console.log(`\n  ${GREEN}▶ Executando:${RESET} ${task}\n`);
}

export function printDone(): void {
  console.log(`\n  ${BOLD}${CYAN}── Aguardando próxima alteração ──${RESET}\n`);
}

export function printShutdown(): void {
  console.log(`\n${YELLOW}Aur Watch finalizado.${RESET}`);
}
