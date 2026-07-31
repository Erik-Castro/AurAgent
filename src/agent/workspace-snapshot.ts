import type { AgentConfig } from '../core/types.ts';
import type { Workspace } from '../ports/workspace.ts';
import { isValidArtifactPath, type ArtifactRecord } from './state.ts';

const EXCLUDED = /(node_modules|\.git|\.aur)/;
const LIST_TIMEOUT_ENTRIES = 5000;

export async function indexWorkspace(
  workspace: Workspace,
  config: AgentConfig,
): Promise<ArtifactRecord[]> {
  let entries: string[];
  try {
    entries = await workspace.list('**/*');
  } catch {
    entries = [];
  }

  const filtered = entries
    .filter((p) => !EXCLUDED.test(p))
    .slice(0, LIST_TIMEOUT_ENTRIES);

  const records: ArtifactRecord[] = [];
  for (const path of filtered) {
    if (!isValidArtifactPath(path)) continue;
    if (records.length >= config.maxArtifactsInPrompt) break;

    let size = 0;
    try {
      if (await workspace.exists(path)) {
        size = (await workspace.read(path)).length;
      }
    } catch {
      size = 0;
    }

    records.push({
      path,
      size,
      source: 'preexisting',
      updatedAtIteration: 0,
    });
  }

  return records;
}
