# Aur — Agente Autônomo de Programação

**Aur** é um "GenAI Teammate" — um agente autônomo de programação que raciocina, planeja, manipula o sistema de arquivos, executa comandos shell, roda testes e corrige o próprio código. Construído sobre o runtime **Deno 2.x** com **TypeScript**.

Arquitetura hexagonal (Ports & Adapters) com loop ReAct (Reasoning + Acting) orientado a eventos.

> **Status**: 0.1.0 — Projeto em pesquisa ativa.

## Funcionalidades

- **Loop ReAct autônomo**: reasoning → tool call → observation, em ciclo controlado
- **13 ferramentas integradas**: shell, leitura/escrita de arquivos, glob, grep, testes, git, busca na web, instalação de dependências
- **Human-in-the-Loop (HITL)**: comandos de médio/alto risco exigem aprovação
- **Modos de execução**: CLI direta, watch mode (reage a alterações), TUI interativa
- **Pre-commit gate**: valida lint + typecheck após cada escrita, reverte se falhar
- **Detecção de loop estéril**: interrompe ações repetitivas sem progresso
- **Checkpoints e rollback**: snapshots antes de modificações
- **Sumarização adaptativa de contexto**: gerencia janela de contexto do LLM
- **Múltiplos provedores de IA**: Ollama, OpenAI, Anthropic, Gemini (detecção automática pelo prefixo do modelo)
- **Segurança por capabilities**: execute-only com deno.json permissões explícitas
- **Suíte de avaliação (eval)**: cenários de fix, refactor e dep-upgrade

## Pré-requisitos

- [Deno 2.x](https://deno.com)

## Instalação

```bash
# Clonar
git clone <repo-url> && cd AurAgent

# Verificar se funciona
deno task check
```

## Uso

```bash
# Executar agente com uma tarefa
deno task dev "sua tarefa aqui"

# Opções da CLI:
deno task dev -- [flags] "tarefa"

  --approve-all            Pula confirmação HITL
  --readonly               Modo apenas leitura (análise)
  --dry-run                Planeja mas não executa comandos de risco
  --explain                Exibe pensamentos do agente no terminal
  --tui                    Interface TUI interativa
  --rules path/to/file     Arquivo de instruções adicional
  --security-config path   Config personalizada de segurança

# Modo watch (reage a alterações em arquivos)
deno task dev -- watch "tarefa"

# Se nenhuma tarefa for passada no watch mode,
# o padrão é: "corrija erros de lint e testes"
```

### Variáveis de Ambiente

| Variável | Efeito |
|---|---|
| `AUR_MODEL` | Sobrescreve o modelo padrão (ex: `openai/gpt-4o`, `anthropic/claude-sonnet-4-20250514`) |

### Exemplos

```bash
# Executar com modelo personalizado
AUR_MODEL=openai/gpt-4o deno task dev "refatore src/mod.ts para extrair a lógica de validação"

# Análise sem modificar nada
deno task dev --readonly "analise o acoplamento entre módulos"

# Modo TUI
deno task dev --tui "implemente autenticação JWT"
```

## Modelos de IA

O modelo padrão é `ollama/qwen2.5-coder:7b`. O provedor é detectado automaticamente pelo prefixo:

| Prefixo | Provedor |
|---|---|
| `ollama/` | Ollama (servidor local) |
| `openai/` | OpenAI API |
| `anthropic/` | Anthropic API |
| `gemini/` | Gemini API |

**Atenção**: modelos remotos (OpenAI, Anthropic, Gemini) exigem a variável de ambiente `API_KEY` correspondente configurada no provider.

## Desenvolvimento

```bash
deno task check    # Type-check completo
deno task lint     # Lint (inclui regra no-explicit-any)
deno task test     # Testes (exclui eval/)

# Teste específico
deno test --allow-read --allow-write --allow-env tests/agent/memory_test.ts

# Formatador
deno fmt           # Usa singleQuote, lineWidth 100, indentWidth 2
```

## Suíte de Avaliação (Eval)

```bash
# Executar todos os cenários
deno task eval

# Com modelo específico
deno task eval -- --model ollama/llama3.1:8b

# Flags adicionais
--json    # Saída JSON
--save    # Salva baseline para comparação futura
```

Cenários disponíveis em `eval/scenarios/`:
- `fix-simple-bug` — corrige bugs em bases de código pequenas
- `refactor-module` — reorganiza código seguindo princípios de arquitetura limpa
- `dep-upgrade` — atualiza dependências com breaking changes

## Arquitetura

```
src/
├── core/          # Tipos, constantes, erros, registry de ferramentas, config de segurança
├── ports/         # Contratos (interfaces): Workspace, ProcessRunner, ModelProvider, EventBus, MemoryStore
├── adapters/      # Implementações concretas (Deno) + provedores LLM (Ollama, OpenAI, Anthropic, Gemini)
├── agent/         # Agent (entrypoint), ReAct loop, WorkingMemory, checkpoint, HITL, sterile detector, summarizer
├── tools/         # 13 definições + implementações + handler
├── tui/           # Motor de TUI interativa
├── watch/         # File watcher + runner
└── mod.ts         # Barrel export
```

### Fluxo de Execução

1. `main.ts` → parseia flags → `Agent.run(task)`
2. `WorkingMemory` carrega arquivos de instrução do workspace (`AGENT.md`, etc.)
3. `runReActLoop` itera: chama LLM → executa tool calls → processa observações
4. Tool calls paralelizáveis rodam em lote (concorrência: 4)
5. Ao final, sumário da sessão é persistido no Deno KV

## Segurança

- Comandos restritos são bloqueados independente de permissão (rm -rf /, mkfs, dd, chmod 777 /, git push --force)
- Padrões configuráveis em `~/.aur/security.json` (criado automaticamente na primeira execução)
- Três níveis de permissão: `default` (HITL), `approve-all` (automático), `readonly` (análise)

## Limitações Atuais

- `WebSearch` é um stub — retorna "não configurado"
- O agente precisa de todas as permissões Deno: `--allow-run --allow-read --allow-write --allow-net --allow-env`
- A suíte de testes exclui `eval/` da execução padrão

## Licença

MIT
