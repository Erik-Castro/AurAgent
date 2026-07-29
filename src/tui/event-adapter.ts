import type { EventBus } from '../ports/event-bus.ts';
import type { ContentBuffer } from './content-buffer.ts';
import {
  BOLD,
  CYAN,
  DIM,
  GREEN,
  RED,
  RESET,
  YELLOW,
  OK_ICON,
  FAIL_ICON,
  WARN_ICON,
} from './renderer.ts';

export interface StatusState {
  iteration: number;
  maxIterations: number;
  currentTool: string;
  elapsed: string;
  statusText: string;
  task: string;
  model: string;
}

export function createEventAdapter(
  bus: EventBus,
  buffer: ContentBuffer,
  statusTarget: StatusState,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    bus.on('task:started', (ev) => {
      statusTarget.task = String(ev.data.task ?? '');
      statusTarget.statusText = 'executando';
      buffer.push(`${BOLD}${CYAN}━━━ Tarefa iniciada ─━━${RESET}`);
      buffer.push(`  ${DIM}${ev.data.task}${RESET}`);
      buffer.push('');
    }),
  );

  unsubs.push(
    bus.on('task:completed', (ev) => {
      const st = String(ev.data.status ?? '');
      const icon = st === 'success' ? OK_ICON : WARN_ICON;
      const color = st === 'success' ? GREEN : YELLOW;
      statusTarget.statusText = st;
      statusTarget.currentTool = '';
      buffer.push('');
      buffer.push(
        ` ${color}${icon} Tarefa ${st} (${ev.data.iterations} iterações)${RESET}`,
      );
    }),
  );

  unsubs.push(
    bus.on('task:cancelled', (ev) => {
      statusTarget.statusText = 'cancelada';
      statusTarget.currentTool = '';
      buffer.push(
        ` ${RED}${FAIL_ICON} Tarefa cancelada: ${ev.data.error}${RESET}`,
      );
    }),
  );

  unsubs.push(
    bus.on('iteration:started', (ev) => {
      statusTarget.iteration = Number(ev.data.iteration ?? 0);
    }),
  );

  unsubs.push(
    bus.on('tool:started', (ev) => {
      statusTarget.currentTool = String(ev.data.tool ?? '');
      const risk = ev.data.riskLevel as string;
      if (risk === 'high' || risk === 'medium') {
        buffer.push(
          ` ${WARN_ICON} ${YELLOW}${ev.data.tool}${RESET} ${DIM}(risco: ${risk})${RESET}`,
        );
      }
    }),
  );

  unsubs.push(
    bus.on('tool:finished', () => {
      statusTarget.currentTool = '';
    }),
  );

  unsubs.push(
    bus.on('tool:failed', (ev) => {
      statusTarget.currentTool = '';
      buffer.push(
        ` ${RED}${FAIL_ICON} ${ev.data.tool} falhou: ${ev.data.error}${RESET}`,
      );
    }),
  );

  unsubs.push(
    bus.on('model:request_started', () => {
      buffer.push(`${DIM}  consultando modelo...${RESET}`);
    }),
  );

  unsubs.push(
    bus.on('checkpoint:created', (ev) => {
      buffer.push(
        ` ${DIM}💾 checkpoint: ${ev.data.path}${RESET}`,
      );
    }),
  );

  unsubs.push(
    bus.on('checkpoint:restored', () => {
      buffer.push(
        ` ${YELLOW}♻ checkpoint restaurado${RESET}`,
      );
    }),
  );

  return () => unsubs.forEach((fn) => fn());
}
