export interface SecurityRuleSet {
  blockedCommands: string[];
  blockedPatterns: string[];
}

const DEFAULT_SECURITY: SecurityRuleSet = {
  blockedCommands: [
    'rm -rf /',
    'mkfs.',
    'dd if=',
    'chmod 777 /',
    'git push --force',
  ],
  blockedPatterns: [
    '^>\\s+/dev/(sd|nvme|vd)',
    '^curl\\s+(https?://)?(10\\.|192\\.168\\.)',
    '^wget\\s+(https?://)?(10\\.|192\\.168\\.)',
    '^rm\\s+-rf\\s+/(\\s|$)',
  ],
};

const CONFIG_DIR = `${Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || ''}/.aur`;
const CONFIG_PATH = `${CONFIG_DIR}/security.json`;

function ensureDirSync(dir: string): void {
  try {
    Deno.mkdirSync(dir, { recursive: true });
  } catch {
    // already exists
  }
}

export function loadSecurityRules(configPath?: string): RegExp[] {
  const path = configPath || CONFIG_PATH;

  let rules: SecurityRuleSet = { ...DEFAULT_SECURITY };

  try {
    ensureDirSync(CONFIG_DIR);
    const content = Deno.readTextFileSync(path);
    const parsed = JSON.parse(content) as Partial<SecurityRuleSet>;
    rules = {
      blockedCommands: parsed.blockedCommands ?? DEFAULT_SECURITY.blockedCommands,
      blockedPatterns: parsed.blockedPatterns ?? DEFAULT_SECURITY.blockedPatterns,
    };
  } catch {
    try {
      Deno.writeTextFileSync(
        path,
        JSON.stringify(DEFAULT_SECURITY, null, 2) + '\n',
      );
    } catch {
      // cannot write default config, use built-in
    }
  }

  const patterns: RegExp[] = [];

  for (const cmd of rules.blockedCommands) {
    patterns.push(new RegExp(`^${escapeRegex(cmd)}`));
  }
  for (const pat of rules.blockedPatterns) {
    patterns.push(new RegExp(pat));
  }

  return patterns;
}

export function writeDefaultSecurityConfig(targetPath?: string): void {
  const path = targetPath || CONFIG_PATH;
  ensureDirSync(CONFIG_DIR);
  Deno.writeTextFileSync(
    path,
    JSON.stringify(DEFAULT_SECURITY, null, 2) + '\n',
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
