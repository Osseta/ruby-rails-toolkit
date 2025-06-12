import * as fs from 'fs';
import * as path from 'path';
import * as JSON5 from 'json5';
import { Command, AppConfig } from './types';
import { ProcessTracker } from './processTracker';
import { FileLockManager } from './fileLockManager';
import * as vscode from 'vscode';
import { listRdbgSocks } from './utils';
import { getLogger } from './logger';

const APP_COMMANDS_FILENAME = 'app_commands.jsonc';
const VSCODE_DIR = '.vscode';

// Global callback for immediate tree view updates
let onLockAcquiredCallback: (() => void | Promise<void>) | undefined;

// Global reference to the FeatureStateManager for environment variable filtering
let globalFeatureStateManager: import('./featureStateManager').FeatureStateManager | undefined;

/**
 * Sets the global FeatureStateManager instance.
 * This should be called during extension activation.
 */
export function setFeatureStateManager(featureStateManager: import('./featureStateManager').FeatureStateManager): void {
    globalFeatureStateManager = featureStateManager;
}

/**
 * Gets the global FeatureStateManager instance.
 * @returns The FeatureStateManager instance or undefined if not set
 */
export function getFeatureStateManager(): import('./featureStateManager').FeatureStateManager | undefined {
    return globalFeatureStateManager;
}

/**
 * Registers a callback to be called immediately when a lock is acquired.
 * This is used to trigger immediate tree view updates to show loading spinners.
 */
export function setOnLockAcquiredCallback(callback: () => void | Promise<void>): void {
    onLockAcquiredCallback = callback;
}

/**
 * Returns the absolute path to the app_commands.jsonc file in the workspace .vscode directory.
 */
function getAppCommandsFilePath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found.');
    }
    return path.join(workspaceFolders[0].uri.fsPath, VSCODE_DIR, APP_COMMANDS_FILENAME);
}

/**
 * Checks if the app_commands.jsonc file exists in the .vscode directory.
 * @returns true if the file exists, false otherwise
 */
export function appCommandsFileExists(): boolean {
    try {
        return fs.existsSync(getAppCommandsFilePath());
    } catch {
        return false;
    }
}

/**
 * Loads the AppConfig from the .vscode/app_commands.jsonc file.
 * @returns The loaded AppConfig object
 * @throws if the file does not exist or is invalid
 */
export function loadAppConfig(): AppConfig {
    const filePath = getAppCommandsFilePath();
    if (!fs.existsSync(filePath)) {
        return getDefaultAppConfig();
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON5.parse(content) as AppConfig;
}

/**
 * Returns a default AppConfig instance.
 */
export function getDefaultAppConfig(): AppConfig {
    return {
        commands: [
          {
            code: 'RAILS',
            description: 'Web Server',
            command: 'bundle exec rails s',
            commandType: 'ruby'
          },
          {
            code: 'JOBS',
            description: 'Jobs Worker',
            command: 'bundle exec rake jobs:work',
            commandType: 'ruby'
          },
          {
            code: 'WEBPACK',
            description: 'Webpack Dev Server',
            command: 'bin/shakapacker-dev-server',
            commandType: 'shell'
          }
        ],
        features: [
          {
            code: 'DEBUG',
            name: 'Debug Mode',
            description: 'Enables debugging flags for development',
            environment: {
              whitelist: ['DEBUG', 'VERBOSE'],
              blacklist: ['SILENT', 'QUIET']
            }
          },
          {
            code: 'PERFORMANCE',
            name: 'Performance Monitoring',
            description: 'Enables performance monitoring and profiling',
            environment: {
              whitelist: ['PROFILE', 'BENCHMARK'],
              blacklist: ['NO_PROFILING']
            }
          }
        ]
    };
}

/**
 * Saves the given AppConfig to the .vscode/app_commands.jsonc file, overwriting if it exists.
 * @param config The AppConfig to save
 */
export function saveAppConfig(config: AppConfig): void {
    const filePath = getAppCommandsFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Gets additional forbidden environment variables based on feature states.
 * @returns Array of environment variable names to exclude from process spawning
 */
function getAdditionalForbiddenVars(): string[] {
    const featureStateManager = getFeatureStateManager();
    if (!featureStateManager) {
        return [];
    }

    const config = loadAppConfig();
    const features = config.features || [];
    
    return featureStateManager.getForbiddenEnvironmentVariables(features);
}

/**
 * Runs a command using ProcessTracker. Handles both Ruby (with rdbg) and shell commands.
 * @param command The command to run
 * @param waitFlag Optional wait flag override for rdbg (defaults to '-n' for no wait)
 */
export async function runCommand(command: Command, waitFlag: string = '-n') {
    const logger = getLogger();
    logger.info(`Starting command: ${command.code}`, { 
        description: command.description,
        commandType: command.commandType,
        waitFlag 
    });
    
    return await FileLockManager.withLock(command.code, async () => {
        let commandToRun = command.command;

        if (command.commandType === 'ruby') {
            // Prepend rdbg to the command for debugging
            commandToRun = buildRdbgCommand(command.code, command.command, waitFlag);
            logger.debug(`Built rdbg command for ${command.code}`, { commandToRun });
        }
        
        // Get additional forbidden environment variables based on feature states
        const additionalForbiddenVars = getAdditionalForbiddenVars();
        logger.debug(`Additional forbidden vars for ${command.code}`, { additionalForbiddenVars });
        
        const childProcess = await ProcessTracker.spawnAndTrack({
            code: command.code,
            command: commandToRun,
            args: [],
            options: { stdio: 'ignore' },
            additionalForbiddenVars
        });

        logger.debug(`Process spawned for ${command.code}`, { pid: childProcess.pid });

        // Show output channel if setting is enabled
        await showOutputChannelIfEnabled(command.code);
        
        logger.info(`Command ${command.code} started successfully`);
    }, {}, onLockAcquiredCallback);
}

/**
 * Runs a command in debug mode (with wait flag) using ProcessTracker.
 * This starts the command, waits for the rdbg session to be available, then starts a debugging session.
 * @param command The command to run in debug mode
 */
export async function runAndDebugCommand(command: Command) {
    const logger = getLogger();
    
    if (command.commandType !== 'ruby') {
        logger.error(`Attempted to run & debug non-Ruby command: ${command.code}`);
        throw new Error('Run & Debug is only supported for Ruby commands');
    }

    logger.info(`Starting Run & Debug for command: ${command.code}`);

    return await FileLockManager.withLock(command.code, async () => {
        // Start the command with wait flag (empty string means wait for debugger)
        const commandToRun = buildRdbgCommand(command.code, command.command, '');
        logger.debug(`Built rdbg command for debugging ${command.code}`, { commandToRun });
        
        // Get additional forbidden environment variables based on feature states
        const additionalForbiddenVars = getAdditionalForbiddenVars();
        logger.debug(`Additional forbidden vars for ${command.code}`, { additionalForbiddenVars });
        
        const childProcess = await ProcessTracker.spawnAndTrack({
            code: command.code,
            command: commandToRun,
            args: [],
            options: { stdio: 'ignore' },
            additionalForbiddenVars
        });

        logger.debug(`Debug process spawned for ${command.code}`, { pid: childProcess.pid });

        // Show output channel if setting is enabled
        await showOutputChannelIfEnabled(command.code);

        // Wait for the rdbg socket to appear and then start debugging
        logger.debug(`Waiting for rdbg socket for ${command.code}`);
        const socketFile = await waitForRdbgSocket(command.code);
        logger.info(`Found rdbg socket for ${command.code}`, { socketFile });

        // Start VS Code debugger and attach to rdbg
        await startVSCodeDebugSession(command.code, socketFile);
        logger.info(`Debug session started for ${command.code}`);
    }, {}, onLockAcquiredCallback);
}

/**
 * Stops a running command using ProcessTracker.
 * @param command The command to stop
 */
export async function stopCommand(command: Command) {
    const logger = getLogger();
    logger.info(`Stopping command: ${command.code}`);
    
    return await FileLockManager.withLock(command.code, async () => {
        logger.debug(`Command ${command.code} stop requested`);
        await ProcessTracker.stopProcess(command.code);
        logger.debug(`Command ${command.code} stop completed`);
    }, {}, onLockAcquiredCallback);
}

/**
 * Stops all running commands.
 * Used when the "stop all" button is clicked.
 * Each stopped command will have its termination reason set to 'user-requested'.
 * This function looks at all pid files and stops all processes if they are running,
 * regardless of whether they are configured in the current workspace.
 */
export async function stopAllCommands(): Promise<void> {
    const logger = getLogger();
    
    // Get all running process codes from pid files
    const runningCodes = ProcessTracker.listRunningCodes();
    logger.info(`Stopping all commands`, { runningCodes, count: runningCodes.length });
    
    // Stop all running processes in parallel, each with its own lock
    const stopPromises = runningCodes.map(async (code) => {
        logger.debug(`Stopping command ${code}`);
        await FileLockManager.withLock(code, async () => {
            await ProcessTracker.stopProcess(code);
        }, {}, onLockAcquiredCallback);
    });
    
    await Promise.all(stopPromises);
    logger.info(`All commands stopped successfully`);
}

/**
 * Debugs a Ruby command by attaching to rdbg (if running).
 * @param command The command to debug
 */
export async function debugCommand(command: Command) {
    return await FileLockManager.withLock(command.code, async () => {
        if (command.commandType !== 'ruby') {
            // For shell commands, debugging is not supported
            return;
        }

        // Check if a debug session is already active for this command using our CommandStateManager
        const { getGlobalCommandStateManager } = await import('./appRunner');
        const stateManager = getGlobalCommandStateManager();
        if (stateManager) {
            const existingDebugSession = stateManager.getDebugSession(command.code);
            if (existingDebugSession) {
                const error = `Debug session is already active for command: ${command.code}`;
                vscode.window.showErrorMessage(error);
                throw new Error(error);
            }
        }

        // Find the running process PID
        const pid = ProcessTracker.getRunningPid(command.code);
        if (!pid) {
            throw new Error(`No running process found for command: ${command.code}`);
        }

        // Attempt to find the rdbg socket for this PID using listRdbgSocks
        const socksResult = await listRdbgSocks();
        const lines = socksResult.stdout.split('\n').filter(Boolean);
        const socketFile = lines.find((line: string) => line.includes(`rdbg-${pid}-`));
        if (!socketFile) {
            throw new Error(`No rdbg socket found for PID: ${pid}\nAvailable sockets:\n${socksResult.stdout}`);
        }
        // Start a VS Code debug session attached to this socket
        await vscode.debug.startDebugging(undefined, {
            type: 'rdbg',
            name: `Attach to rdbg (${command.code})`,
            request: 'attach',
            debugPort: socketFile,
            autoAttach: true,
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
        });
    }, {}, onLockAcquiredCallback);
}

/**
 * Helper function to build rdbg command for Ruby processes.
 * @param sessionName The session name for rdbg
 * @param baseCommand The base command to wrap with rdbg
 * @param waitFlag Optional wait flag for rdbg (empty string means wait, '-n' means no wait)
 * @returns The complete rdbg command string
 */
function buildRdbgCommand(sessionName: string, baseCommand: string, waitFlag: string = '-n'): string {
    return `bundle exec rdbg --open --session-name=${sessionName} ${waitFlag} --command -- env -u HEADLESS ${baseCommand}`;
}

/**
 * Helper function to show output channel if the setting is enabled.
 * @param commandCode The command code to get the output channel for
 */
async function showOutputChannelIfEnabled(commandCode: string): Promise<void> {
    const showOutput = vscode.workspace.getConfiguration('rubyToolkit').get('automaticallyShowOutputForCommand');
    if (showOutput) {
        const outputChannel = ProcessTracker.getOutputChannel(commandCode);
        if (outputChannel) {
            outputChannel.show(true);
        }
    }
}

/**
 * Helper function to wait for an rdbg socket to appear and return it.
 * @param sessionName The session name to look for in the socket list
 * @param maxRetries Maximum number of retry attempts (default: 10)
 * @param retryInterval Interval between retries in milliseconds (default: 500)
 * @returns The socket file path
 * @throws Error if socket is not found after all retries
 */
export async function waitForRdbgSocket(sessionName: string, maxRetries: number = 10, retryInterval: number = 500): Promise<string> {
    let socketFile: string | undefined;
    let lastSocksResult: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const socksResult = await listRdbgSocks();
            lastSocksResult = socksResult;
            const lines = socksResult.stdout.split('\n').filter(Boolean);
            socketFile = lines.find((line: string) => line.includes(`-${sessionName}`));
            
            if (socketFile) {
                return socketFile;
            }
            
            // Wait before the next attempt (except on the last attempt)
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
        } catch (error) {
            // If this is the last attempt, let the error propagate
            if (attempt === maxRetries - 1) {
                throw new Error(`Failed to find rdbg socket for ${sessionName} session after ${maxRetries} attempts\nLast error: ${error}\nAvailable sockets:\n${lastSocksResult?.stdout || 'Unable to list sockets'}`);
            }
            // Otherwise, wait and try again
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }

    throw new Error(`No rdbg socket found for ${sessionName} session\nAvailable sockets:\n${lastSocksResult?.stdout || 'Unable to list sockets'}`);
}

/**
 * Helper function to start a VS Code debug session attached to rdbg.
 * @param sessionName The session name for the debug session
 * @param socketFile The rdbg socket file path
 * @returns Promise that resolves when the debug session starts
 */
export async function startVSCodeDebugSession(sessionName: string, socketFile: string): Promise<void> {
    await vscode.debug.startDebugging(undefined, {
        type: 'rdbg',
        name: `Attach to rdbg (${sessionName})`,
        request: 'attach',
        debugPort: socketFile,
        autoAttach: true,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
    });
}