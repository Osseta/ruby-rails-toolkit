import * as fs from 'fs';
import * as path from 'path';
import { Command, AppConfig } from './types';
import { ProcessTracker } from './processTracker';
import { FileLockManager } from './fileLockManager';
import * as vscode from 'vscode';
import { listRdbgSocks } from './utils';

const APP_COMMANDS_FILENAME = 'app_commands.json';
const VSCODE_DIR = '.vscode';

/**
 * Returns the absolute path to the app_commands.json file in the workspace .vscode directory.
 */
function getAppCommandsFilePath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found.');
    }
    return path.join(workspaceFolders[0].uri.fsPath, VSCODE_DIR, APP_COMMANDS_FILENAME);
}

/**
 * Checks if the app_commands.json file exists in the .vscode directory.
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
 * Loads the AppConfig from the .vscode/app_commands.json file.
 * @returns The loaded AppConfig object
 * @throws if the file does not exist or is invalid
 */
export function loadAppConfig(): AppConfig {
    const filePath = getAppCommandsFilePath();
    if (!fs.existsSync(filePath)) {
        return getDefaultAppConfig();
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as AppConfig;
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
            commandType: 'ruby',
            wait: false
          },
          {
            code: 'JOBS',
            description: 'Jobs Worker',
            command: 'bundle exec rake jobs:work',
            commandType: 'ruby',
            wait: false
          }
        ]
    };
}

/**
 * Saves the given AppConfig to the .vscode/app_commands.json file, overwriting if it exists.
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
 */
export async function runCommand(command: Command) {
    return await FileLockManager.withLock(command.code, async () => {
        let commandToRun = command.command;

        if (command.commandType === 'ruby') {
            // Prepend rdbg to the command for debugging
            const waitFlag = command.wait === false ? '-n' : '';
            commandToRun = `bundle exec rdbg --open --session-name=${command.code} ${waitFlag} --command -- env -u HEADLESS ${command.command}`;
        }
        const childProcess = ProcessTracker.spawnAndTrack({
            code: command.code,
            command: commandToRun,
            args: [],
            options: { stdio: 'ignore' }
        });

        // Show output channel if setting is enabled
        const showOutput = vscode.workspace.getConfiguration('rubyToolkit').get('automaticallyShowOutputForCommand');
        if (showOutput) {
            const outputChannel = ProcessTracker.getOutputChannel(command.code);
            if (outputChannel) {
                outputChannel.show(true);
            }
        }
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