Com ajuda escrevi os seguintes documentos:

DOCUMENTAÇÃO DE PRODUTO E ENGENHARIA: AUR

Abaixo estão o Product Requirements Document (PRD) e a Technical Specification (Spec) para o Aur, o agente autônomo de programação (Coding Agent) projetado sobre o runtime Deno. A documentação foi elaborada para refletir uma visão estratégica de produto aliada a uma arquitetura técnica robusta, escalável e segura.

PARTE 1: PRODUCT REQUIREMENTS DOCUMENT (PRD)

1. Visão Geral e Objetivos

A iniciativa Opencode visa revolucionar o Software Development Life Cycle (SDLC) tradicional, transformando-o de um processo iterativo manual para um ciclo aumentado e autônomo impulsionado por IA.
O produto central dessa visão é o Aur, um "GenAI Teammate" altamente interativo e agêntico. Diferente de assistentes baseados puramente em chat que atuam como oráculos passivos, o Aur possui agência sobre o ambiente de desenvolvimento. Ele raciocina, planeja, manipula o sistema de arquivos, executa comandos de shell, roda testes e corrige o próprio código. O objetivo principal do Aur é reduzir a carga cognitiva (cognitive load) dos desenvolvedores e acelerar o tempo de entrega (time-to-market), mantendo a governança e a segurança da infraestrutura.

2. Público-Alvo

O Aur é desenhado para:

Desenvolvedores Individuais e Engenheiros de Software: Que buscam a experiência de "Vibe Coding" — focar na intenção de negócios e arquitetura enquanto o agente lida com a digitação, refatoração estrutural, boilerplate e resolução de dependências.

Arquitetos de Solução / Staff Engineers: Que necessitam realizar análises de impacto em larga escala através de múltiplos repositórios, padronizando bases de código e extraindo documentação técnica automatizada.

DevOps e Platform Engineers: Focados em automação de infraestrutura, scripts de CI/CD e manutenção de ambientes de desenvolvimento locais.


3. User Stories Detalhadas

US01 - Autocorreção Baseada em Testes: Como desenvolvedor, quero que o Aur execute a suíte de testes do meu projeto e, em caso de falhas (red), analise a saída de erro e corrija o código iterativamente até que todos os testes passem (green), para garantir a integridade do código sem intervenção manual contínua.

US02 - Análise Arquitetural Global: Como arquiteto, quero que o agente analise todo o repositório em busca de acoplamentos indevidos e sugira mudanças estruturais baseadas em princípios como Clean Architecture, para mitigar dívida técnica de forma proativa.

US03 - Refatoração Segura com Human-in-the-Loop: Como desenvolvedor sênior, quero que o Aur planeje uma migração de framework, mas exija minha aprovação antes de executar comandos destrutivos (como rm -rf ou alterações em massa), garantindo controle total sobre mudanças críticas no ambiente.


4. Funcionalidades Principais (Core Features)

Loop de Raciocínio Agêntico (ReAct): Implementação nativa do padrão ReAct (Reasoning and Acting). O Aur planeja os passos necessários (Thought), escolhe as ferramentas (Action) e analisa os logs gerados pelo sistema operacional (Observation) antes de decidir o próximo passo.

Execução de Ferramentas (Tool Use - Foco no 'ShellBash'): A habilidade vitalícia do agente. O Aur possui uma interface de Function Calling otimizada para o ShellBash, permitindo navegação em diretórios, instalação de pacotes, manipulação de arquivos e execução de binários locais.

Memória de Contexto e Alinhamento de Padrões: O agente é context-aware. Ele varre o diretório em busca de arquivos de instrução (ex: AGENT.md, ARCHITECTURE.md) e os injeta em seu prompt de sistema para garantir que o código gerado ou modificado respeite os padrões de projeto, stack tecnológica e convenções da equipe.


5. Segurança e Governança

Princípio do Privilégio Mínimo (Deno Sandbox): Tirando proveito da arquitetura de segurança do Deno (Deno Permissions), o processo do Aur é iniciado apenas com as permissões explicitamente concedidas. Diretórios sensíveis do sistema hospedeiro permanecem inacessíveis.

Barreira Human-in-the-Loop (HITL): Qualquer comando classificado como de alto impacto (ex: modificações de rede extensas, deleções de sistema) pausa o loop do agente, emitindo uma solicitação via socket para a interface de usuário aguardando aprovação explícita (Y/N).


PARTE 2: TECHNICAL SPECIFICATION (SPEC)

1. Stack Tecnológica

Runtime: Deno 2.x, escolhido por sua velocidade, segurança nativa por capabilities, e aderência estrita aos padrões web (Web APIs).

Linguagem: TypeScript nativo, dispensando steps complexos de build (sem configuração de tsconfig.json extenuante ou bundlers para o desenvolvimento do agente).

Integrações de IA: Model Context Protocol (MCP) para padronizar a conexão com LLMs, permitindo alternar entre modelos (ex: Gemini, Claude, OpenAI) de forma agnóstica.

Persistência: Deno KV para armazenamento de estado e memória de longo prazo persistente, aproveitando a API atômica e integrada do runtime.


2. Arquitetura do Agente

A arquitetura central do Aur é estruturada em torno de um motor assíncrono projetado para gerenciar ciclos de LLM eficientemente.

Loop Principal (ReAct Loop)

O agente opera através de um loop while controlado e protegido contra recursão infinita (Deadlock/Hallucination Loops).

// Pseudo-código da arquitetura do Loop Principal  
async function agenticLoop(task: string, maxIterations = 15): Promise<Result> {  
  let iterations = 0;  
  let isTaskComplete = false;  
    
  while (iterations < maxIterations && !isTaskComplete) {  
    // 1. Gera plano/próxima ação via LLM (Promises assíncronas)  
    const completion = await llm.generate(memory.getContext());  
      
    // 2. Verifica se a IA decidiu usar uma ferramenta  
    if (completion.hasToolCalls) {  
      for (const call of completion.toolCalls) {  
        if (call.name === 'ShellBash') {  
           const observation = await executeShellBash(call.args);  
           memory.append(observation);  
        }  
      }  
    } else if (completion.isFinalAnswer) {  
      isTaskComplete = true;  
    }  
      
    iterations++;  
  }  
  return generateFinalReport();  
}

Gestão de Fluxo via WebStreams

Para prover uma experiência "Vibe Coding" responsiva, o fluxo de texto e logs é manipulado usando ReadableStream e TransformStream. Isso permite que a interface do usuário renderize os tokens gerados pelo LLM e a saída de stdout do shell do usuário em tempo real, mantendo baixo consumo de memória (sem buffering excessivo de strings).

sequenceDiagram  
    participant U as Usuário  
    participant W as WebStream (UI)  
    participant A as Aur Agent (Deno)  
    participant LLM as LLM (MCP)  
    participant OS as ShellBash (OS)  
  
    U->>A: "Execute os testes e corrija"  
    activate A  
    A->>LLM: Injeta Prompt + Contexto  
    LLM-->>A: (Stream de Tokens de Thought)  
    A-->>W: Encaminha Stream para a UI  
    LLM-->>A: Tool Call: ShellBash("deno test")  
    A->>OS: Deno.Command("deno test")  
    activate OS  
    OS-->>A: stdout (Testes falharam)  
    deactivate OS  
    A->>LLM: Observação: Logs de erro  
    LLM-->>A: Tool Call: ShellBash("edita arquivo x")  
    A->>OS: Executa correção  
    A-->>W: Atualiza Stream (Correção feita)  
    deactivate A

3. Especificação da Ferramenta 'ShellBash'

O ShellBash é o cordão umbilical entre o agente e o ambiente do desenvolvedor.

JSON Schema (Function Calling)

{  
  "name": "ShellBash",  
  "description": "Executa comandos de shell bash no sistema operacional. Suporta comandos encadeados. Não interativo.",  
  "parameters": {  
    "type": "object",  
    "properties": {  
      "command": {  
        "type": "string",  
        "description": "A linha de comando a ser executada (ex: 'ls -la', 'deno lint', 'cat arquivo.ts')."  
      },  
      "cwd": {  
        "type": "string",  
        "description": "Opcional: O diretório de trabalho atual onde o comando deve ser executado."  
      },  
      "timeout_ms": {  
        "type": "number",  
        "description": "Opcional: Tempo limite para a execução em milissegundos para prevenir travamentos."  
      }  
    },  
    "required": ["command"]  
  }  
}

Implementação via Deno.Command e Isolamento

A execução utiliza a API nativa Deno.Command, configurada para capturar tanto o fluxo normal quanto o fluxo de erros.

const cmd = new Deno.Command("bash", {  
  args: ["-c", call.command],  
  cwd: call.cwd || Deno.cwd(),  
  stdout: "piped",  
  stderr: "piped",  
});  
const { code, stdout, stderr } = await cmd.output();

Estratégia de Permissão: O Deno exige que o Aur seja instanciado via CLI com as flags corretas. A recomendação padrão de uso limitará o acesso:
deno run --allow-run=bash --allow-read=/path/to/project --allow-write=/path/to/project --allow-net --allow-env agent.ts

4. Gerenciamento de Memória e Contexto

Para o agente manter a coesão sobre longos ciclos de vida de desenvolvimento:

Memória de Curto Prazo (Working Memory): Array de mensagens de chat da sessão atual. Como a janela de contexto de modelos modernos é vasta, essa lista acumula todo o ciclo ReAct (Pensamentos, Ações, Logs).

Memória de Longo Prazo: Utiliza Deno KV. Cada sessão de trabalho ou conjunto de conhecimento estrutural (ex: "preferências de arquitetura do projeto X") pode ser sumarizado e persistido atomicamente no OpenKV. Quando o agente é reiniciado em um diretório, ele verifica o Deno KV para resgatar históricos anteriores.

Sumarização de Contexto (Context Window Management): Comandos shell frequentemente retornam logs maciços (ex: instalação de pacotes npm/deno). Um middleware intercepta qualquer stdout acima de 2.000 tokens e invoca uma requisição LLM secundária (mais barata/rápida) para sumarizar o log, mantendo apenas a "essência da ação e status final" antes de injetar de volta na memória de curto prazo do agente.


5. Fluxo de Erro e Autocorreção (Feedback Loop)

O grande diferencial do Aur é sua resiliência a falhas de ambiente. Se uma ação do ShellBash falha:

1. O processo captura o code !== 0 e os dados brutos de stderr.


2. A aplicação formata isso de volta para o agente sob a etiqueta Observation.


3. O LLM recebe um prompt do sistema injetado no turno seguinte que instrui: "A última execução de ferramenta falhou. Leia a mensagem de erro fornecida, deduza a causa raiz (ex: dependência faltante, erro de sintaxe) e proponha um novo comando shell ou modificação de arquivo para contornar o problema."


4. O loop reinicia, aplicando o conceito Self-Healing Code.



6. Portabilidade e Deploy

Binário Único na Máquina do Dev: Utilizando a capacidade de compilação do Deno (deno compile), o Aur pode ser distribuído como um binário independente e executável nativamente em Linux, macOS ou Windows. Isso remove a fricção de exigir que o desenvolvedor instale ambientes específicos — basta executar o binário $ aur start.

Edge Agents via Deno Deploy: Para equipes distribuídas que necessitam de agentes operando sobre repositórios versionados na nuvem (Cloud SDLC), partes da arquitetura agêntica (como os webhooks de CI/CD que acionam revisões automáticas) serão provisionados no Deno Deploy, aproveitando a inicialização instantânea no edge global e integração out-of-the-box com o Deno KV via nuvem.



---

ADENDO AO PRD: MÉTRICAS, INTERFACES E GOVERNANÇA

6. Métricas de Sucesso (KPIs)



6.1 Eficácia Agêntica

· Taxa de Resolução Autônoma (TRA): Percentual de tarefas concluídas sem intervenção humana (aprovação HITL ou edição manual).
Meta inicial: > 60% das tarefas de correção de testes.
· Tempo Médio até a Conclusão (TMC): Tempo entre o início da tarefa e a entrega validada (testes passando). Comparável ao baseline manual.
· Índice de Autocorreção em 1ª Tentativa: Percentual de falhas de execução que o agente resolve na primeira ação corretiva.

6.2 Qualidade do Código

· Taxa de Regressão: Percentual de mudanças que quebram testes anteriormente verdes.
· Cobertura de Testes Gerada: Linhas ou branches cobertos por novos testes criados pelo agente.
· Aderência a Padrões: Medida por similaridade com código existente (AST matching) ou conformidade com linters configurados.

6.3 Satisfação do Desenvolvedor

· Net Promoter Score (NPS) coletado ao final de cada sessão.
· Taxa de Abandono de Tarefa: Quando o usuário interrompe o agente e assume manualmente.
· Tempo de Revisão de Código Gerado: Minutos gastos pelo dev revisando diffs produzidos pelo Aur.

7. Interface e Integração com o Desenvolvedor



7.1 Modos de Interação

· Aur CLI: Interface primária via terminal. Comando aur run "tarefa". Suporte a flags:
· --approve-all: ignora verificações HITL (para ambientes controlados).
· --dry-run: o agente planeja mas não executa comandos ShellBash.
· --explain: exibe pensamentos do agente em linguagem natural.
· Aur Watch: Modo daemon que monitora alterações em arquivos e executa ações pré-configuradas (ex: rodar testes e corrigir automaticamente ao salvar).
· Integração com IDEs: Plugin para VS Code / JetBrains expondo:
· Painel de chat com streaming.
· Diferenças inline com aprovação/rejeição individual (hunk-level).
· Atalhos para aprovar comandos HITL.

7.2 Fluxo Human-in-the-Loop (HITL)

1. O agente classifica a ação de alto impacto e pausa o loop.


2. A interface exibe: comando a executar, justificativa do agente, avaliação de risco (baixo/médio/alto).


3. O usuário pode: aprovar, rejeitar, editar o comando ou solicitar mais informações.


4. Após aprovação, o agente executa e continua o loop.




---

ADENDO À SPEC: ROBUSTEZ, SEGURANÇA E OTIMIZAÇÕES

7. Mecanismos Avançados de Segurança



7.1 Lista de Comandos Restritos

Um conjunto de padrões de comandos bloqueados, independente de HITL:

rm -rf /    (qualquer caminho absoluto ou fora do workspace)  
> /dev/sda  
mkfs.*  
dd if=  
chmod 777 /  
git push --force (origens remotas protegidas)  
curl/wget para IPs internos (rede corporativa)

Configurável via aur.security.toml.

7.2 Modo Somente Leitura (--readonly)

Permite análise, geração de relatórios e sugestões, mas bloqueia qualquer escrita em disco e execução de comandos modificadores. Ideal para auditoria arquitetural.

7.3 Validação de Código Gerado (Pre-commit Gate)

Antes de salvar qualquer arquivo, o agente executa:

· Linter configurado do projeto (ESLint, deno lint).
· Análise estática de segurança (ex: semgrep com regras de vulnerabilidade).
· Verificação de tipo (TypeScript tsc --noEmit).
Se falhar, o agente entra em loop de autocorreção limitado a 3 tentativas; após isso, notifica o usuário.

8. Robustez do Loop ReAct



8.1 Detecção de Loop Estéril

Monitora similaridade entre ações consecutivas:

· Se o mesmo comando ShellBash é executado 3 vezes com saída idêntica, o loop é interrompido e o usuário alertado.
· Se a sequência de modificações de arquivo gera um diff vazio repetidamente, idem.

8.2 Checkpoints e Rollback

· Checkpoint automático: a cada modificação de arquivo, o estado anterior é armazenado em ~/.aur/checkpoints/ (ou Deno KV) com diff reversível.
· Rollback: se o agente detectar regressão (testes que passavam agora falham), pode reverter ao último checkpoint e tentar abordagem alternativa.
· Branch de experimento: opcionalmente, o agente cria uma branch Git (aur/exp/task-id) e commita checkpoints, facilitando revisão e reset.

8.3 Paralelização de Tool Calls

O loop principal analisa as tool calls retornadas pelo LLM; se forem independentes (ex: ler 3 arquivos distintos ou executar comandos em diretórios diferentes sem dependência), executa-as em paralelo usando Promise.all, respeitando limite de concorrência (padrão: 4).

9. Sumarização Adaptativa e Gestão de Contexto



9.1 Gatilhos de Sumarização

· Por tamanho: stdout/stderr > 2.000 tokens (modelo de tokenização rápida do provedor).
· Por idade: mensagens mais antigas que N turnos (configurável) são sumarizadas em uma única observação "Resumo das ações anteriores...".
· Sumário de sessão: ao final de cada tarefa, um sumário de alto nível é persistido no Deno KV como memória de longo prazo, associado à identidade do projeto (hash do caminho + remoto git).

9.2 Busca de Arquivos de Instrução

Ordem de precedência:

1. AGENT.md (ou .agent.md) na raiz do workspace ou diretório atual.


2. ARCHITECTURE.md na raiz.


3. .cursorrules, .github/copilot-instructions.md (compatibilidade).


4. Arquivos especificados via --rules path/to/rules.md.



Os conteúdos são concatenados ao prompt de sistema com marcadores de origem.

10. Documentação Arquitetural Automática



10.1 Geração de ARCHITECTURE.md

Após tarefas de grande porte (ex: refatoração de módulo), o agente pode ser instruído a:

· Analisar a topologia de imports.
· Extrair componentes principais, fluxos de dados e decisões de design.
· Redigir ou atualizar um ARCHITECTURE.md conciso, respeitando template definido no projeto.

11. Benchmarking e Testes da IA (Aur Eval Suite)



11.1 Suíte de Desafios

Conjunto de repositórios com tarefas conhecidas e resultados esperados:

· Fix failing tests: repositórios com testes quebrados (bugs simples).
· Refactor to clean architecture: código acoplado que deve ser reorganizado.
· Dependency upgrade: atualização de biblioteca com breaking changes.

11.2 Métricas de Avaliação

· TRA, TMC e Taxa de Regressão (ver seção 6).
· Comparação entre modelos (Gemini, Claude, GPT) e versões do agente.
· Executado via CI a cada release do Aur.

12. Edge Agents no Deno Deploy (Cloud SDLC)



12.1 Funcionamento

· O Aur é empacotado como função Deno Deploy com permissões restritas.
· Acionado por webhooks (GitHub, GitLab) em eventos como pull_request.opened.
· Acessa o repositório efêmero via API (clonagem shallow em memória ou acesso a arquivos via GitHub API).
· Executa ações de revisão automática, correção de lint ou geração de documentação, comentando no PR.
· Utiliza Deno KV remoto para cache de análises e contexto do projeto.

12.2 Limitações

· Sem acesso a shell real (apenas Deno APIs). Ferramenta ShellBash substituída por Deno.Command com comandos simulados ou sandbox limitado.
· Timeout de execução da função (inferior ao ambiente local).


---

CATÁLOGO DE FERRAMENTAS DO AGENTE AUR

Todas as ferramentas seguem o formato de Function Calling compatível com MCP. Abaixo o schema detalhado de cada uma.

1. ShellBash



Descrição: Executa comandos de shell bash no sistema operacional. Suporte a pipes, redirecionamentos e variáveis de ambiente. Não interativo.
Parâmetros:

· command (string, required): Linha de comando.
· cwd (string, optional): Diretório de trabalho.
· timeout_ms (number, optional): Tempo limite em ms (padrão 30_000).
· env (object, optional): Variáveis de ambiente extras.
Comportamento:
· Bloqueia comandos da lista restrita.
· Captura stdout e stderr separadamente.
· Trunca saída em 100.000 caracteres, preservando início e fim.
· Retorna { code, stdout, stderr, truncated }.

2. ReadFile



Descrição: Lê o conteúdo de um ou mais arquivos do sistema de arquivos.
Parâmetros:

· paths (string[], required): Caminhos relativos ao workspace.
· encoding (string, optional: "utf-8" | "base64"): padrão utf-8.
· lines (object, optional): { start: number, end: number } para leitura parcial.
Retorno: Array de { path, content, language, size }.

3. WriteFile



Descrição: Cria ou sobrescreve um arquivo. Sujeito a HITL se classificado como alto impacto.
Parâmetros:

· path (string, required): Caminho relativo.
· content (string, required): Conteúdo a escrever.
· mode ("create" | "overwrite" | "append"): padrão "overwrite".
Comportamento:
· Antes de escrever, gera checkpoint.
· Após escrita, executa linter e verificação de tipo se configurado.
· Se falhar na validação, reverte e notifica.

4. FindFiles



Descrição: Busca arquivos por padrão glob com suporte a exclusões.
Parâmetros:

· pattern (string, required): ex **/*.ts.
· exclude (string[], optional): padrões de exclusão (ex node_modules).
· max_results (number, optional): padrão 200.
Retorno: Lista de caminhos relativos.

5. Grep



Descrição: Busca textual recursiva em arquivos (regex ou literal).
Parâmetros:

· query (string, required): Expressão regular ou string.
· path (string, optional): Subdiretório para limitar busca (padrão: raiz).
· include (string, optional): Filtro de arquivo (ex *.ts).
· case_sensitive (boolean, optional): padrão false.
· max_results (number, optional): padrão 50.
Retorno: Array de { file, line, column, content }.

6. RunTests



Descrição: Executa a suíte de testes do projeto e retorna resultados estruturados.
Parâmetros:

· framework (string, optional): "deno", "jest", "vitest", etc. Detecta automaticamente.
· filter (string, optional): Padrão de nome de teste (ex: "auth").
· coverage (boolean, optional): Se true, gera relatório de cobertura.
Retorno: { passed, failed, skipped, total, failures: [{ file, test, message }], coverage? }.

7. ListDependencies



Descrição: Lista pacotes e versões do projeto (package.json, deno.json, etc.).
Parâmetros:

· ecosystem (string, optional): "npm", "deno", "python". Detecta automaticamente.
· outdated_only (boolean, optional): Mostra apenas desatualizadas.
Retorno: Array de { name, version, latest?, type: "prod" | "dev" }.

8. InstallDependency



Descrição: Instala ou atualiza um pacote. Sujeito a HITL para upgrades maiores.
Parâmetros:

· name (string, required): Nome do pacote.
· version (string, optional): Versão específica ou "latest".
· dev (boolean, optional): Se é dependência de desenvolvimento.
Comportamento: Executa comando adequado (npm install, deno add, etc.) e retorna log sumarizado.

9. WebSearch



Descrição: Realiza busca na web para obter informações atualizadas (ex: documentação de API, erros desconhecidos).
Parâmetros:

· query (string, required).
· max_results (number, optional): padrão 3.
Retorno: Array de { title, snippet, url }.

10. WebFetch



Descrição: Obtém conteúdo textual de uma URL (ex: página de docs, changelog).
Parâmetros:

· url (string, required).
· extract_main_content (boolean, optional): padrão true (remove navegação/ads).
Retorno: Texto sumarizado (se muito longo) ou completo.

11. GitDiff



Descrição: Mostra alterações atuais no repositório (unstaged ou contra HEAD).
Parâmetros:

· staged_only (boolean, optional): padrão false.
· path (string, optional): Filtrar por caminho.
Retorno: String do diff.

12. GitCommit



Descrição: Cria um commit com as alterações atuais. Sujeito a HITL.
Parâmetros:

· message (string, required): Mensagem do commit.
· files (string[], optional): Arquivos específicos a incluir (padrão todos).
Comportamento: Executa git add e git commit. Retorna hash do commit.

13. AskUser



Descrição: Ferramenta especial que pausa o loop e faz uma pergunta ao usuário (ex: “Qual a chave de API para o serviço X?”). Utilizada quando o agente não tem informação suficiente e precisa de esclarecimento.
Parâmetros:

· question (string, required).
· options (string[], optional): Lista de respostas pré-definidas.
Retorno: Resposta do usuário como string.
Aqui está a documentação complementar, organizada em adendos para o PRD e para a Spec, seguida do catálogo completo de ferramentas do agente.

---

ADENDO AO PRD: MÉTRICAS, INTERFACES E GOVERNANÇA

6. Métricas de Sucesso (KPIs)

6.1 Eficácia Agêntica

· Taxa de Resolução Autônoma (TRA): Percentual de tarefas concluídas sem intervenção humana (aprovação HITL ou edição manual).
    Meta inicial: > 60% das tarefas de correção de testes.
· Tempo Médio até a Conclusão (TMC): Tempo entre o início da tarefa e a entrega validada (testes passando). Comparável ao baseline manual.
· Índice de Autocorreção em 1ª Tentativa: Percentual de falhas de execução que o agente resolve na primeira ação corretiva.

6.2 Qualidade do Código

· Taxa de Regressão: Percentual de mudanças que quebram testes anteriormente verdes.
· Cobertura de Testes Gerada: Linhas ou branches cobertos por novos testes criados pelo agente.
· Aderência a Padrões: Medida por similaridade com código existente (AST matching) ou conformidade com linters configurados.

6.3 Satisfação do Desenvolvedor

· Net Promoter Score (NPS) coletado ao final de cada sessão.
· Taxa de Abandono de Tarefa: Quando o usuário interrompe o agente e assume manualmente.
· Tempo de Revisão de Código Gerado: Minutos gastos pelo dev revisando diffs produzidos pelo Aur.

7. Interface e Integração com o Desenvolvedor

7.1 Modos de Interação

· Aur CLI: Interface primária via terminal. Comando aur run "tarefa". Suporte a flags:
  · --approve-all: ignora verificações HITL (para ambientes controlados).
  · --dry-run: o agente planeja mas não executa comandos ShellBash.
  · --explain: exibe pensamentos do agente em linguagem natural.
· Aur Watch: Modo daemon que monitora alterações em arquivos e executa ações pré-configuradas (ex: rodar testes e corrigir automaticamente ao salvar).
· Integração com IDEs: Plugin para VS Code / JetBrains expondo:
  · Painel de chat com streaming.
  · Diferenças inline com aprovação/rejeição individual (hunk-level).
  · Atalhos para aprovar comandos HITL.

7.2 Fluxo Human-in-the-Loop (HITL)

1. O agente classifica a ação de alto impacto e pausa o loop.
2. A interface exibe: comando a executar, justificativa do agente, avaliação de risco (baixo/médio/alto).
3. O usuário pode: aprovar, rejeitar, editar o comando ou solicitar mais informações.
4. Após aprovação, o agente executa e continua o loop.

---

ADENDO À SPEC: ROBUSTEZ, SEGURANÇA E OTIMIZAÇÕES

7. Mecanismos Avançados de Segurança

7.1 Lista de Comandos Restritos

Um conjunto de padrões de comandos bloqueados, independente de HITL:

```
rm -rf /    (qualquer caminho absoluto ou fora do workspace)
> /dev/sda
mkfs.*
dd if=
chmod 777 /
git push --force (origens remotas protegidas)
curl/wget para IPs internos (rede corporativa)
```

Configurável via aur.security.toml.

7.2 Modo Somente Leitura (--readonly)

Permite análise, geração de relatórios e sugestões, mas bloqueia qualquer escrita em disco e execução de comandos modificadores. Ideal para auditoria arquitetural.

7.3 Validação de Código Gerado (Pre-commit Gate)

Antes de salvar qualquer arquivo, o agente executa:

· Linter configurado do projeto (ESLint, deno lint).
· Análise estática de segurança (ex: semgrep com regras de vulnerabilidade).
· Verificação de tipo (TypeScript tsc --noEmit).
  Se falhar, o agente entra em loop de autocorreção limitado a 3 tentativas; após isso, notifica o usuário.

8. Robustez do Loop ReAct

8.1 Detecção de Loop Estéril

Monitora similaridade entre ações consecutivas:

· Se o mesmo comando ShellBash é executado 3 vezes com saída idêntica, o loop é interrompido e o usuário alertado.
· Se a sequência de modificações de arquivo gera um diff vazio repetidamente, idem.

8.2 Checkpoints e Rollback

· Checkpoint automático: a cada modificação de arquivo, o estado anterior é armazenado em ~/.aur/checkpoints/ (ou Deno KV) com diff reversível.
· Rollback: se o agente detectar regressão (testes que passavam agora falham), pode reverter ao último checkpoint e tentar abordagem alternativa.
· Branch de experimento: opcionalmente, o agente cria uma branch Git (aur/exp/task-id) e commita checkpoints, facilitando revisão e reset.

8.3 Paralelização de Tool Calls

O loop principal analisa as tool calls retornadas pelo LLM; se forem independentes (ex: ler 3 arquivos distintos ou executar comandos em diretórios diferentes sem dependência), executa-as em paralelo usando Promise.all, respeitando limite de concorrência (padrão: 4).

9. Sumarização Adaptativa e Gestão de Contexto

9.1 Gatilhos de Sumarização

· Por tamanho: stdout/stderr > 2.000 tokens (modelo de tokenização rápida do provedor).
· Por idade: mensagens mais antigas que N turnos (configurável) são sumarizadas em uma única observação "Resumo das ações anteriores...".
· Sumário de sessão: ao final de cada tarefa, um sumário de alto nível é persistido no Deno KV como memória de longo prazo, associado à identidade do projeto (hash do caminho + remoto git).

9.2 Busca de Arquivos de Instrução

Ordem de precedência:

1. AGENT.md (ou .agent.md) na raiz do workspace ou diretório atual.
2. ARCHITECTURE.md na raiz.
3. .cursorrules, .github/copilot-instructions.md (compatibilidade).
4. Arquivos especificados via --rules path/to/rules.md.

Os conteúdos são concatenados ao prompt de sistema com marcadores de origem.

10. Documentação Arquitetural Automática

10.1 Geração de ARCHITECTURE.md

Após tarefas de grande porte (ex: refatoração de módulo), o agente pode ser instruído a:

· Analisar a topologia de imports.
· Extrair componentes principais, fluxos de dados e decisões de design.
· Redigir ou atualizar um ARCHITECTURE.md conciso, respeitando template definido no projeto.

11. Benchmarking e Testes da IA (Aur Eval Suite)

11.1 Suíte de Desafios

Conjunto de repositórios com tarefas conhecidas e resultados esperados:

· Fix failing tests: repositórios com testes quebrados (bugs simples).
· Refactor to clean architecture: código acoplado que deve ser reorganizado.
· Dependency upgrade: atualização de biblioteca com breaking changes.

11.2 Métricas de Avaliação

· TRA, TMC e Taxa de Regressão (ver seção 6).
· Comparação entre modelos (Gemini, Claude, GPT) e versões do agente.
· Executado via CI a cada release do Aur.

12. Edge Agents no Deno Deploy (Cloud SDLC)

12.1 Funcionamento

· O Aur é empacotado como função Deno Deploy com permissões restritas.
· Acionado por webhooks (GitHub, GitLab) em eventos como pull_request.opened.
· Acessa o repositório efêmero via API (clonagem shallow em memória ou acesso a arquivos via GitHub API).
· Executa ações de revisão automática, correção de lint ou geração de documentação, comentando no PR.
· Utiliza Deno KV remoto para cache de análises e contexto do projeto.

12.2 Limitações

· Sem acesso a shell real (apenas Deno APIs). Ferramenta ShellBash substituída por Deno.Command com comandos simulados ou sandbox limitado.
· Timeout de execução da função (inferior ao ambiente local).

---

CATÁLOGO DE FERRAMENTAS DO AGENTE AUR

Todas as ferramentas seguem o formato de Function Calling compatível com MCP. Abaixo o schema detalhado de cada uma.

1. ShellBash

Descrição: Executa comandos de shell bash no sistema operacional. Suporte a pipes, redirecionamentos e variáveis de ambiente. Não interativo.
Parâmetros:

· command (string, required): Linha de comando.
· cwd (string, optional): Diretório de trabalho.
· timeout_ms (number, optional): Tempo limite em ms (padrão 30_000).
· env (object, optional): Variáveis de ambiente extras.
  Comportamento:
· Bloqueia comandos da lista restrita.
· Captura stdout e stderr separadamente.
· Trunca saída em 100.000 caracteres, preservando início e fim.
· Retorna { code, stdout, stderr, truncated }.

2. ReadFile

Descrição: Lê o conteúdo de um ou mais arquivos do sistema de arquivos.
Parâmetros:

· paths (string[], required): Caminhos relativos ao workspace.
· encoding (string, optional: "utf-8" | "base64"): padrão utf-8.
· lines (object, optional): { start: number, end: number } para leitura parcial.
  Retorno: Array de { path, content, language, size }.

3. WriteFile

Descrição: Cria ou sobrescreve um arquivo. Sujeito a HITL se classificado como alto impacto.
Parâmetros:

· path (string, required): Caminho relativo.
· content (string, required): Conteúdo a escrever.
· mode ("create" | "overwrite" | "append"): padrão "overwrite".
  Comportamento:
· Antes de escrever, gera checkpoint.
· Após escrita, executa linter e verificação de tipo se configurado.
· Se falhar na validação, reverte e notifica.

4. FindFiles

Descrição: Busca arquivos por padrão glob com suporte a exclusões.
Parâmetros:

· pattern (string, required): ex **/*.ts.
· exclude (string[], optional): padrões de exclusão (ex node_modules).
· max_results (number, optional): padrão 200.
  Retorno: Lista de caminhos relativos.

5. Grep

Descrição: Busca textual recursiva em arquivos (regex ou literal).
Parâmetros:

· query (string, required): Expressão regular ou string.
· path (string, optional): Subdiretório para limitar busca (padrão: raiz).
· include (string, optional): Filtro de arquivo (ex *.ts).
· case_sensitive (boolean, optional): padrão false.
· max_results (number, optional): padrão 50.
  Retorno: Array de { file, line, column, content }.

6. RunTests

Descrição: Executa a suíte de testes do projeto e retorna resultados estruturados.
Parâmetros:

· framework (string, optional): "deno", "jest", "vitest", etc. Detecta automaticamente.
· filter (string, optional): Padrão de nome de teste (ex: "auth").
· coverage (boolean, optional): Se true, gera relatório de cobertura.
  Retorno: { passed, failed, skipped, total, failures: [{ file, test, message }], coverage? }.

7. ListDependencies

Descrição: Lista pacotes e versões do projeto (package.json, deno.json, etc.).
Parâmetros:

· ecosystem (string, optional): "npm", "deno", "python". Detecta automaticamente.
· outdated_only (boolean, optional): Mostra apenas desatualizadas.
  Retorno: Array de { name, version, latest?, type: "prod" | "dev" }.

8. InstallDependency

Descrição: Instala ou atualiza um pacote. Sujeito a HITL para upgrades maiores.
Parâmetros:

· name (string, required): Nome do pacote.
· version (string, optional): Versão específica ou "latest".
· dev (boolean, optional): Se é dependência de desenvolvimento.
  Comportamento: Executa comando adequado (npm install, deno add, etc.) e retorna log sumarizado.

9. WebSearch

Descrição: Realiza busca na web para obter informações atualizadas (ex: documentação de API, erros desconhecidos).
Parâmetros:

· query (string, required).
· max_results (number, optional): padrão 3.
  Retorno: Array de { title, snippet, url }.

10. WebFetch

Descrição: Obtém conteúdo textual de uma URL (ex: página de docs, changelog).
Parâmetros:

· url (string, required).
· extract_main_content (boolean, optional): padrão true (remove navegação/ads).
  Retorno: Texto sumarizado (se muito longo) ou completo.

11. GitDiff

Descrição: Mostra alterações atuais no repositório (unstaged ou contra HEAD).
Parâmetros:

· staged_only (boolean, optional): padrão false.
· path (string, optional): Filtrar por caminho.
  Retorno: String do diff.

12. GitCommit

Descrição: Cria um commit com as alterações atuais. Sujeito a HITL.
Parâmetros:

· message (string, required): Mensagem do commit.
· files (string[], optional): Arquivos específicos a incluir (padrão todos).
  Comportamento: Executa git add e git commit. Retorna hash do commit.

13. AskUser

Descrição: Ferramenta especial que pausa o loop e faz uma pergunta ao usuário (ex: “Qual a chave de API para o serviço X?”). Utilizada quando o agente não tem informação suficiente e precisa de esclarecimento.
Parâmetros:

· question (string, required).
· options (string[], optional): Lista de respostas pré-definidas.
  Retorno: Resposta do usuário como string.
ADENDO À SPEC: ABSTRAÇÃO DO RUNTIME E FILOSOFIA DE EXECUÇÃO

13. Filosofia do Runtime

O Aur adota o Deno 2.x como plataforma de execução oficial devido às seguintes características:

- Modelo de segurança baseado em Capabilities (Permissions).
- Suporte nativo às Web APIs modernas.
- Execução direta de TypeScript.
- API de processos ("Deno.Command").
- Streams nativas ("ReadableStream", "TransformStream" e "WritableStream").
- Compatibilidade com grande parte do ecossistema Node.js.
- Facilidade de execução em ambientes restritos como Linux, macOS, Windows, servidores domésticos e Android (Termux) sem adaptações complexas.

A escolha do Deno tem como objetivo reduzir a complexidade operacional do projeto e aproveitar uma plataforma moderna orientada aos padrões da Web.

13.1 Independência Arquitetural

Apesar do Deno ser a plataforma oficial, o núcleo do Aur não deve depender diretamente das APIs do runtime.

Toda interação com recursos específicos da plataforma deve ocorrer através de camadas de abstração bem definidas.

O objetivo é permitir:

- testes unitários desacoplados do sistema operacional;
- substituição de implementações para ambientes específicos;
- evolução futura para outros runtimes, caso necessário;
- redução do acoplamento entre regras de negócio e infraestrutura.

A arquitetura segue os princípios da Ports and Adapters (Hexagonal Architecture).

---

14. Camadas de Infraestrutura

As APIs nativas do Deno deverão permanecer encapsuladas em adaptadores.

Workspace

Responsável pelo acesso ao sistema de arquivos.

interface Workspace {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    remove(path: string): Promise<void>;
    list(pattern?: string): Promise<string[]>;
}

Implementação padrão:

- DenoWorkspace

Possíveis implementações futuras:

- MemoryWorkspace
- GitHubWorkspace
- RemoteWorkspace
- ZipWorkspace

---

ProcessRunner

Responsável pela execução de processos.

interface ProcessRunner {
    run(request: ProcessRequest): Promise<ProcessResult>;
}

Implementação padrão:

- DenoProcessRunner

Possíveis implementações futuras:

- DockerRunner
- SSHRunner
- MockRunner
- SandboxRunner

---

MemoryStore

Responsável pela persistência de estado.

interface MemoryStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
}

Implementação padrão:

- DenoKVStore

Implementações futuras:

- SQLiteStore
- PostgreSQLStore
- RedisStore
- FileStore

---

ModelProvider

A integração com modelos de linguagem será realizada através de uma interface comum.

interface ModelProvider {
    generate(request: GenerateRequest): Promise<GenerateResponse>;
    stream(request: StreamRequest): ReadableStream<ModelEvent>;
    embeddings?(input: string[]): Promise<number[][]>;
}

Implementações previstas:

- OllamaProvider
- OpenAIProvider
- AnthropicProvider
- GeminiProvider
- LMStudioProvider

O restante da arquitetura não deverá possuir conhecimento sobre o provedor utilizado.

---

15. Arquitetura Orientada a Eventos

Todo o runtime será baseado em eventos internos.

Cada etapa importante da execução produzirá eventos consumidos por componentes independentes.

Exemplos:

- TaskStarted
- TaskCompleted
- TaskCancelled
- IterationStarted
- IterationFinished
- ToolStarted
- ToolFinished
- ToolFailed
- ModelRequestStarted
- ModelRequestFinished
- CheckpointCreated
- CheckpointRestored
- MemoryLoaded
- MemoryPersisted

Esta abordagem desacopla completamente:

- Interface de usuário;
- Sistema de logs;
- Telemetria;
- Plugins;
- Métricas;
- Ferramentas de depuração.

---

16. Eficiência Computacional

O Aur foi concebido para operar de forma eficiente em hardware de recursos limitados.

O objetivo do projeto é minimizar o consumo de recursos do orquestrador, permitindo que a maior parte da capacidade computacional permaneça disponível para a inferência dos modelos de IA.

As principais estratégias adotadas incluem:

- Processamento baseado em Streams, evitando carregamento integral de grandes volumes de dados em memória.
- Uso de processamento incremental para respostas dos modelos e saída de ferramentas.
- Redução de buffers intermediários.
- Sumarização adaptativa de contexto.
- Limitação configurável de concorrência.
- Reutilização de conexões persistentes com provedores LLM.
- Evitar dependências externas quando houver APIs equivalentes disponíveis no runtime.

---

17. Portabilidade

Um dos objetivos estratégicos do Aur é executar de maneira consistente em diferentes classes de dispositivos.

Plataformas alvo:

- Linux
- Windows
- macOS
- Raspberry Pi
- Servidores domésticos (HomeLab)
- VPS de baixo custo
- Android (Termux)

O projeto deve privilegiar APIs padronizadas da Web e abstrações próprias, reduzindo dependências específicas de sistema operacional.

---

18. Princípios de Engenharia

Durante toda a evolução do projeto, deverão ser observados os seguintes princípios:

- Runtime pequeno e previsível.
- Núcleo independente de infraestrutura.
- Infraestrutura substituível por adaptadores.
- Ferramentas desacopladas do agente.
- Provedores de IA intercambiáveis.
- Uso preferencial de Web APIs.
- Segurança baseada em capacidades.
- Arquitetura orientada a eventos.
- Eficiência em memória e processamento.
- Compatibilidade com ambientes Edge e dispositivos de recursos limitados.

Esses princípios orientam a evolução do Aur como uma plataforma de pesquisa em agentes autônomos, permitindo experimentar diferentes arquiteturas, modelos de IA e estratégias de execução sem comprometer a estabilidade do núcleo do sistema.
