import * as fs from 'fs';
import * as path from 'path';
import * as JSON5 from 'json5';
import { Command, AppConfig } from './types';
import { ProcessTracker } from './processTracker';
import { FileLockManager } from './fileLockManager';
import * as vscode from 'vscode';
import { listRdbgSocks } from './utils';

const APP_COMMANDS_FILENAME = 'app_commands.jsonc';
const VSCODE_DIR = '.vscode';

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
 * Runs a command using ProcessTracker. Handles both Ruby (with rdbg) and shell commands.
 * @param command The command to run
 * @param waitFlag Optional wait flag override for rdbg (defaults to '-n' for no wait)
 */
export async function runCommand(command: Command, waitFlag: string = '-n') {
    return await FileLockManager.withLock(command.code, async () => {
        let commandToRun = command.command;

        if (command.commandType === 'ruby') {
            // Prepend rdbg to the command for debugging
            commandToRun = buildRdbgCommand(command.code, command.command, waitFlag);
        }
        
        const childProcess = ProcessTracker.spawnAndTrack({
            code: command.code,
            command: commandToRun,
            args: [],
            options: { stdio: 'ignore' }
        });

        // Show output channel if setting is enabled
        await showOutputChannelIfEnabled(command.code);
    });
}

/**
 * Runs a command in debug mode (with wait flag) using ProcessTracker.
 * This starts the command, waits for the rdbg session to be available, then starts a debugging session.
 * @param command The command to run in debug mode
 */
export async function runAndDebugCommand(command: Command) {
    if (command.commandType !== 'ruby') {
        // For shell commands, debugging is not supported
        throw new Error('Run & Debug is only supported for Ruby commands');
    }

    return await FileLockManager.withLock(command.code, async () => {
        // Start the command with wait flag (empty string means wait for debugger)
        const commandToRun = buildRdbgCommand(command.code, command.command, '');
        
        const childProcess = ProcessTracker.spawnAndTrack({
            code: command.code,
            command: commandToRun,
            args: [],
            options: { stdio: 'ignore' }
        });

        // Show output channel if setting is enabled
        await showOutputChannelIfEnabled(command.code);

        // Wait for the rdbg socket to appear and then start debugging
        const socketFile = await waitForRdbgSocket(command.code);

        // Start VS Code debugger and attach to rdbg
        await startVSCodeDebugSession(command.code, socketFile);
    });
}

/**
 * Stops a running command using ProcessTracker.
 * @param command The command to stop
 */
export async function stopCommand(command: Command) {
    return await FileLockManager.withLock(command.code, async () => {
        ProcessTracker.stopProcess(command.code);
    });
}

/**
 * Stops all running commands.
 * Used when the "stop all" button is clicked.
 * Each stopped command will have its termination reason set to 'user-requested'.
 * This function looks at all pid files and stops all processes if they are running,
 * regardless of whether they are configured in the current workspace.
 */
export async function stopAllCommands(): Promise<void> {
    // Get all running process codes from pid files
    const runningCodes = ProcessTracker.listRunningCodes();
    
    // Stop all running processes in parallel, each with its own lock
    const stopPromises = runningCodes.map(async (code) => {
        await FileLockManager.withLock(code, async () => {
            ProcessTracker.stopProcess(code);
        });
    });
    
    await Promise.all(stopPromises);
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
    });
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