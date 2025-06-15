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

export const defaultProcessState: ProcessState = {
  exists: false,
  debugActive: false,
  terminationReason: 'none',  // Default to 'none' for no termination reason
  hasOutputChannel: false,
  isLocked: false,
  workspaceHash: undefined,
};

export type Command = {
  code: string;
  description: string;
  command: string;
  commandType: 'ruby' | 'shell';
}

export type Commands = Command[];

/**
 * Represents the environment configuration for a feature.
 */
export type FeatureEnvironment = {
  whitelist: string[];
  blacklist: string[];
}

/**
 * Represents a feature with environment variable configuration.
 */
export type Feature = {
  code: string;
  name: string;
  description: string;
  environment: FeatureEnvironment;
}

export type Features = Feature[];

export type AppConfig = {
  commands: Commands;
  features?: Features;
}