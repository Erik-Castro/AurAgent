export interface WorkspaceEntry {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface Workspace {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  list(pattern?: string): Promise<string[]>;
  readMultiple(paths: string[]): Promise<WorkspaceEntry[]>;
}
