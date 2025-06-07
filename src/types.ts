/**
 * Represents the name of an rdbg session.
 */
export type RdbgSessionName = string;

/**
 * Represents the path to an rdbg socket file.
 */
export type RdbgSocketPath = string | null;

/**
 * Represents why a process terminated.
 */
export type ProcessTerminationReason = 'user-requested' | 'crashed' | 'none';

/**
 * Represents the extended state of a process including termination reason.
 */
export type ProcessState = {
  exists: boolean;
  debugActive: boolean;
  terminationReason: ProcessTerminationReason;
  hasOutputChannel: boolean;
  isLocked: boolean;
  workspaceHash?: string;
};

export type Command = {
  code: string;
  description: string;
  command: string;
  commandType: 'ruby' | 'shell';
  wait: boolean;
}

export type Commands = Command[];

export type AppConfig = {
  commands: Commands;
}