import type { ApprovalDecision } from '../core/types.ts';

const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

export class HITLManager {
  requestApproval(
    toolName: string,
    args: Record<string, unknown>,
    riskLevel: string,
  ): ApprovalDecision {
    const riskColor = riskLevel === 'high' ? RED : YELLOW;

    console.log(
      `\n${riskColor}${BOLD}⚠  Ação de Risco: ${riskLevel.toUpperCase()}${RESET}`,
    );
    console.log(`${CYAN}Ferramenta:${RESET} ${toolName}`);
    console.log(
      `${CYAN}Argumentos:${RESET} ${JSON.stringify(args, null, 2)}`,
    );
    console.log('');

    const input = prompt(
      `${BOLD}[A]provar | [R]ejeitar | [E]ditar${RESET}`,
    )?.trim().toLowerCase() ?? 'r';

    switch (input) {
      case 'a':
        return { approved: true };

      case 'e': {
        const editedRaw = prompt('Argumentos editados (JSON):');
        if (editedRaw?.trim()) {
          try {
            const editedArgs = JSON.parse(editedRaw);
            return { approved: true, editedArgs };
          } catch {
            console.log('JSON inválido. Mantendo originais.');
            return { approved: true };
          }
        }
        return { approved: true };
      }

      default:
        return { approved: false, reason: 'Rejeitado pelo usuário' };
    }
  }
}
