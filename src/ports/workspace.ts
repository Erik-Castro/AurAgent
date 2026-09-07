export interface WorkspaceEntry {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface FileStat {
  size: number;
  isFile: boolean;
}

export interface Workspace {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  list(pattern?: string): Promise<string[]>;
  readMultiple(paths: string[]): Promise<WorkspaceEntry[]>;

  /** Return file metadata without loading content. */
  stat(path: string): Promise<FileStat | null>;
  /** Stream file content line-by-line without loading the entire file. */
  readStream(path: string): AsyncIterable<string>;
  /** Count lines without loading the entire file. */
  lineCount(path: string): Promise<number>;
}
