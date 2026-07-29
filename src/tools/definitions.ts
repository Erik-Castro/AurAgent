import type { ToolDefinition } from '../core/types.ts';

export const SHELL_BASH_DEF: ToolDefinition = {
  name: 'ShellBash',
  description:
    'Executa comandos de shell bash no sistema operacional. Suporte a pipes, redirecionamentos e variáveis de ambiente. Não interativo.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Linha de comando a ser executada (ex: ls -la, deno lint, cat arquivo.ts).',
      },
      cwd: {
        type: 'string',
        description: 'Opcional: O diretório de trabalho atual onde o comando deve ser executado.',
      },
      timeout_ms: {
        type: 'number',
        description: 'Opcional: Tempo limite para a execução em milissegundos para prevenir travamentos.',
      },
      env: {
        type: 'object',
        description: 'Opcional: Variáveis de ambiente extras.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['command'],
  },
};

export const READ_FILE_DEF: ToolDefinition = {
  name: 'ReadFile',
  description: 'Lê o conteúdo de um ou mais arquivos do sistema de arquivos.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Caminhos relativos ao workspace.',
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'base64'],
        description: 'Codificação do arquivo (padrão utf-8).',
      },
      lines: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Linha inicial (0-indexed).' },
          end: { type: 'number', description: 'Linha final (exclusivo).' },
        },
        description: 'Leitura parcial de linhas.',
      },
    },
    required: ['paths'],
  },
};

export const WRITE_FILE_DEF: ToolDefinition = {
  name: 'WriteFile',
  description: 'Cria ou sobrescreve um arquivo. Sujeito a HITL se classificado como alto impacto.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho relativo ao workspace.',
      },
      content: {
        type: 'string',
        description: 'Conteúdo a escrever.',
      },
      mode: {
        type: 'string',
        enum: ['create', 'overwrite', 'append'],
        description: 'Modo de escrita (padrão overwrite).',
      },
    },
    required: ['path', 'content'],
  },
};

export const FIND_FILES_DEF: ToolDefinition = {
  name: 'FindFiles',
  description: 'Busca arquivos por padrão glob com suporte a exclusões.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Padrão glob (ex: **/*.ts).',
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Padrões de exclusão (ex: node_modules).',
      },
      max_results: {
        type: 'number',
        description: 'Limite de resultados (padrão 200).',
      },
    },
    required: ['pattern'],
  },
};

export const GREP_DEF: ToolDefinition = {
  name: 'Grep',
  description: 'Busca textual recursiva em arquivos (regex ou literal).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Expressão regular ou string a ser buscada.',
      },
      path: {
        type: 'string',
        description: 'Subdiretório para limitar a busca (padrão: raiz do workspace).',
      },
      include: {
        type: 'string',
        description: 'Filtro de arquivo (ex: *.ts).',
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Diferenciar maiúsculas de minúsculas (padrão false).',
      },
      max_results: {
        type: 'number',
        description: 'Limite de resultados (padrão 50).',
      },
    },
    required: ['query'],
  },
};

export const RUN_TESTS_DEF: ToolDefinition = {
  name: 'RunTests',
  description: 'Executa a suíte de testes do projeto e retorna resultados estruturados.',
  parameters: {
    type: 'object',
    properties: {
      framework: {
        type: 'string',
        enum: ['deno', 'jest', 'vitest'],
        description: 'Framework de testes. Detecta automaticamente.',
      },
      filter: {
        type: 'string',
        description: 'Padrão de nome de teste (ex: auth).',
      },
      coverage: {
        type: 'boolean',
        description: 'Se true, gera relatório de cobertura.',
      },
    },
  },
};

export const LIST_DEPS_DEF: ToolDefinition = {
  name: 'ListDependencies',
  description: 'Lista pacotes e versões do projeto (package.json, deno.json, etc.).',
  parameters: {
    type: 'object',
    properties: {
      ecosystem: {
        type: 'string',
        enum: ['npm', 'deno', 'python'],
        description: 'Ecossistema. Detecta automaticamente.',
      },
      outdated_only: {
        type: 'boolean',
        description: 'Mostrar apenas pacotes desatualizados.',
      },
    },
  },
};

export const INSTALL_DEP_DEF: ToolDefinition = {
  name: 'InstallDependency',
  description: 'Instala ou atualiza um pacote. Sujeito a HITL para upgrades maiores.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do pacote.',
      },
      version: {
        type: 'string',
        description: 'Versão específica ou "latest".',
      },
      dev: {
        type: 'boolean',
        description: 'Se é dependência de desenvolvimento.',
      },
    },
    required: ['name'],
  },
};

export const WEB_SEARCH_DEF: ToolDefinition = {
  name: 'WebSearch',
  description: 'Realiza busca na web para obter informações atualizadas (ex: documentação de API, erros desconhecidos).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Termo de busca.',
      },
      max_results: {
        type: 'number',
        description: 'Limite de resultados (padrão 3).',
      },
    },
    required: ['query'],
  },
};

export const WEB_FETCH_DEF: ToolDefinition = {
  name: 'WebFetch',
  description: 'Obtém conteúdo textual de uma URL (ex: página de docs, changelog).',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL a ser acessada.',
      },
      extract_main_content: {
        type: 'boolean',
        description: 'Extrair apenas o conteúdo principal (remove navegação/ads).',
      },
    },
    required: ['url'],
  },
};

export const GIT_DIFF_DEF: ToolDefinition = {
  name: 'GitDiff',
  description: 'Mostra alterações atuais no repositório (unstaged ou contra HEAD).',
  parameters: {
    type: 'object',
    properties: {
      staged_only: {
        type: 'boolean',
        description: 'Mostrar apenas alterações staged (padrão false).',
      },
      path: {
        type: 'string',
        description: 'Filtrar diff por caminho específico.',
      },
    },
  },
};

export const GIT_COMMIT_DEF: ToolDefinition = {
  name: 'GitCommit',
  description: 'Cria um commit com as alterações atuais. Sujeito a HITL.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Mensagem do commit.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Arquivos específicos a incluir (padrão: todos os modificados).',
      },
    },
    required: ['message'],
  },
};

export const ASK_USER_DEF: ToolDefinition = {
  name: 'AskUser',
  description: 'Pausa o loop e faz uma pergunta ao usuário quando o agente não tem informação suficiente.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Pergunta a ser feita ao usuário.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de respostas pré-definidas para o usuário escolher.',
      },
    },
    required: ['question'],
  },
};

export const ALL_DEFINITIONS: ToolDefinition[] = [
  SHELL_BASH_DEF,
  READ_FILE_DEF,
  WRITE_FILE_DEF,
  FIND_FILES_DEF,
  GREP_DEF,
  RUN_TESTS_DEF,
  LIST_DEPS_DEF,
  INSTALL_DEP_DEF,
  WEB_SEARCH_DEF,
  WEB_FETCH_DEF,
  GIT_DIFF_DEF,
  GIT_COMMIT_DEF,
  ASK_USER_DEF,
];
