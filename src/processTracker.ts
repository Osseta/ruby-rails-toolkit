import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import type { ProcessTerminationReason } from './types';

/**
 * Manages process tracking using PID files in a user-specific directory.
 * Used for both Ruby (with or without rdbg) and shell commands.
 * Also tracks process termination reasons to determine proper icon display.
 */
export class ProcessTracker {
    private static readonly PID_DIR = 'pids';
    private static readonly STATE_DIR = 'process-states';
    
    private static outputChannels: Map<string, vscode.OutputChannel> = new Map();
    private static extensionContext: vscode.ExtensionContext | undefined;

    /**
     * Initializes the ProcessTracker with the extension context.
     * This must be called during extension activation.
     */
    static initialize(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
    }

    static getPidDir(): string {
        if (this.extensionContext?.globalStorageUri) {
            return path.join(this.extensionContext.globalStorageUri.fsPath, this.PID_DIR);
        }
        // Fallback to os.tmpdir if context is not available
        return path.join(os.tmpdir(), this.PID_DIR);
    }

    static getStateDir(): string {
        if (this.extensionContext?.globalStorageUri) {
            return path.join(this.extensionContext.globalStorageUri.fsPath, this.STATE_DIR);
        }
        // Fallback to os.tmpdir if context is not available
        return path.join(os.tmpdir(), this.STATE_DIR);
    }

    /**
     * Ensures the PID directory exists.
     */
    static ensurePidDir(): void {
        if (!fs.existsSync(this.getPidDir())) {
            fs.mkdirSync(this.getPidDir(), { recursive: true });
        }
    }

    /**
     * Ensures the state directory exists.
     */
    static ensureStateDir(): void {
        if (!fs.existsSync(this.getStateDir())) {
            fs.mkdirSync(this.getStateDir(), { recursive: true });
        }
    }

    /**
     * Returns the path to the PID file for a given command code.
     */
    static getPidFilePath(code: string): string {
        return path.join(this.getPidDir(), `${code}.pid`);
    }

    /**
     * Returns the path to the state file for a given command code.
     */
    static getStateFilePath(code: string): string {
        return path.join(this.getStateDir(), `${code}.state`);
    }

    /**
     * Sets the termination reason for a process.
     */
    static setTerminationReason(code: string, reason: ProcessTerminationReason): void {
        this.ensureStateDir();
        const stateFile = this.getStateFilePath(code);
        fs.writeFileSync(stateFile, reason, 'utf8');
    }

    /**
     * Gets the termination reason for a process.
     */
    static getTerminationReason(code: string): ProcessTerminationReason {
        const stateFile = this.getStateFilePath(code);
        if (!fs.existsSync(stateFile)) {
            return 'none';
        }
        const content = fs.readFileSync(stateFile, 'utf8').trim();
        return content as ProcessTerminationReason || 'none';
    }

    /**
     * Clears the termination reason for a process.
     */
    static clearTerminationReason(code: string): void {
        const stateFile = this.getStateFilePath(code);
        if (fs.existsSync(stateFile)) {
            fs.unlinkSync(stateFile);
        }
    }

    /**
     * Spawns a process and tracks it with a PID file. Sends output to a VS Code OutputChannel.
     * Removes the PID file when the process exits.
     * Uses the current VS Code process.env, but removes specific Ruby-related variables.
     * Outputs all subprocess PIDs to the OutputChannel.
     * @param code Unique code for the command
     * @param command Command to run
     * @param args Arguments for the command
     * @param options Spawn options
     * @returns The spawned ChildProcess
     */
    static spawnAndTrack({ code, command, args = [], options = {} }: { code: string, command: string, args?: string[], options?: any }): ChildProcessWithoutNullStreams {
        this.ensurePidDir();
        // Clear any previous termination reason when starting a new process
        this.clearTerminationReason(code);
        
        // Create or reuse output channel
        let outputChannel = this.outputChannels.get(code);
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel(`Run: ${code}`);
            this.outputChannels.set(code, outputChannel);
        }

        // Prepare environment: copy process.env and remove specific variables
        const forbiddenVars = [
            'RBENV_DIR', 'RBENV_HOOK_PATH', 'RBENV_ORIG_PATH',
            'RBENV_ROOT', 'RBENV_VERSION', 'RUBYLIB', 'BUNDLE_GEMFILE'
        ];
        const env = { ...process.env };
        for (const v of forbiddenVars) {
            delete env[v];
        }
        const shell = process.env.SHELL || 'zsh';
        const child = spawn(shell, ['-c', `echo ${command}; ${command} ${args.join(' ')}`], {
          env,
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
        const pidFile = this.getPidFilePath(code);
        fs.writeFileSync(pidFile, String(child.pid));
        child.stdout?.on('data', (data: Buffer) => {
            const processedData = this.preprocessOutputData(data.toString(), code);
            outputChannel.append(processedData);
        });
        child.stderr?.on('data', (data: Buffer) => {
            const processedData = this.preprocessOutputData(data.toString(), code);
            outputChannel.append(processedData);
        });
        child.on('exit', (exitCode: number | null, signal: string | null) => {
            if (fs.existsSync(pidFile)) {
                fs.unlinkSync(pidFile);
            }
            
            // Determine termination reason - if no explicit user termination was set, it's a crash
            const currentReason = this.getTerminationReason(code);
            if (currentReason === 'none') {
                // Process exited without user intervention, mark as crashed
                this.setTerminationReason(code, 'crashed');
                
                // Show the output channel to help user see what went wrong
                const outputChannel = this.outputChannels.get(code);
                if (outputChannel) {
                    outputChannel.show(true);
                    vscode.window.showErrorMessage(
                        `Process "${code}" crashed unexpectedly. Check the output channel for details.`,
                        'Show Output'
                    ).then((selection) => {
                        if (selection === 'Show Output') {
                            outputChannel.show(true);
                        }
                    });
                }
            }
            
            outputChannel.appendLine(`\n[Process exited with code ${exitCode}${signal ? `, signal ${signal}` : ''}]`);
        });
        return child;
    }

    /**
     * Checks if a process for the given code is running.
     * @param code Command code
     * @returns true if running, false otherwise
     */
    static isRunning(code: string): boolean {
        const pidFile = this.getPidFilePath(code);
        if (!fs.existsSync(pidFile)) {return false;}
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            fs.unlinkSync(pidFile);
            return false;
        }
    }

    /**
     * Returns the PID for a given code if the process is still running, otherwise returns undefined.
     * @param code Command code
     * @returns The PID as a number, or undefined if not running
     */
    static getRunningPid(code: string): number | undefined {
        const pidFile = this.getPidFilePath(code);
        if (!fs.existsSync(pidFile)) {
            return undefined;
        }
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        try {
            process.kill(pid, 0);
            return pid;
        } catch {
            fs.unlinkSync(pidFile);
            return undefined;
        }
    }

    /**
     * Stops the process for the given code, if running.
     * @param code Command code
     */
    static stopProcess(code: string): void {
        const pidFile = this.getPidFilePath(code);
        if (!fs.existsSync(pidFile)) {return;}
        
        // Mark as user-requested termination before killing the process
        this.setTerminationReason(code, 'user-requested');
        
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        try {
            process.kill(pid, 'SIGTERM');
        } catch {}
        fs.unlinkSync(pidFile);
    }

    /**
     * Gets the output channel for a given code if it exists.
     * @param code Command code
     * @returns The output channel or undefined if not found
     */
    static getOutputChannel(code: string): vscode.OutputChannel | undefined {
        return this.outputChannels.get(code);
    }

    /**
     * Checks if an output channel exists for a given code.
     * @param code Command code
     * @returns true if output channel exists, false otherwise
     */
    static hasOutputChannel(code: string): boolean {
        return this.outputChannels.has(code);
    }

    /**
     * Disposes of the output channel for a given code.
     * @param code Command code
     */
    static disposeOutputChannel(code: string): void {
        const outputChannel = this.outputChannels.get(code);
        if (outputChannel) {
            outputChannel.dispose();
            this.outputChannels.delete(code);
        }
    }

    /**
     * Lists all codes with running processes.
     */
    static listRunningCodes(): string[] {
        this.ensurePidDir();
        return fs.readdirSync(this.getPidDir())
            .filter(f => f.endsWith('.pid'))
            .map(f => f.replace(/\.pid$/, ''))
            .filter(code => this.isRunning(code));
    }

    /**
     * Clears all termination reasons. Used when "stop all" is clicked.
     */
    static clearAllTerminationReasons(): void {
        this.ensureStateDir();
        try {
            const stateFiles = fs.readdirSync(this.getStateDir())
                .filter(f => f.endsWith('.state'));
            for (const file of stateFiles) {
                fs.unlinkSync(path.join(this.getStateDir(), file));
            }
        } catch (error) {
            // Directory might not exist or be empty, which is fine
        }
    }

    /**
     * Disposes of all output channels.
     */
    static disposeAllOutputChannels(): void {
        for (const [code, outputChannel] of this.outputChannels) {
            outputChannel.dispose();
        }
        this.outputChannels.clear();
    }

    /**
     * Preprocesses output data from spawned processes before writing to output buffer.
     * Processes data line by line and modifies lines that meet certain criteria.
     * Also checks for error patterns and shows output channel when needed.
     * @param data The raw output data from the spawned process
     * @param code Optional command code to identify which output channel to show
     * @returns The processed data ready for output buffer
     */
    static preprocessOutputData(data: string, code?: string): string {
        // Check if data contains server error pattern and show output channel
        if (data.includes('Completed 500 Internal Server Error') && code) {
            const config = vscode.workspace.getConfiguration('runRspec');
            const showOn500Errors = config.get<boolean>('showProcessOutputOnServer500Errors', true);
            if (showOn500Errors) {
                this.outputChannels.get(code)?.show(true);
            }
        }

        // Split data into lines while preserving line endings
        const lines = data.split('\n');
        const processedLines = lines.map((line, index) => {
            // Don't process the last line if it's empty (incomplete line)
            if (index === lines.length - 1 && line === '') {
                return line;
            }
            
            // Apply preprocessing criteria here
            // Look for patterns that look like file paths and prepend them with 'file://'
            
            // Pattern to match file paths with optional line numbers and extra text: 
            // - Handles relative paths (dir/file.ext) and absolute paths (/dir/file.ext)
            // - Supports optional line numbers with extra text (file.ext:45:on frrcr)
            // - Matches files with any extension (at least one character after the dot)
            // - Matches paths that come after quotes (both single and double)
            const filePathPattern = /(?:^|\s|"|')((?:\/)?(?:[a-zA-Z_][a-zA-Z0-9_-]*\/)*[a-zA-Z_][a-zA-Z0-9_.-]*\.[a-zA-Z0-9]+(?::\d+(?::[^\s"']*)?)?)/g;
            
            let processedLine = line;
            
            // Only process if the line doesn't already contain 'file://'
            if (!line.includes('file://')) {
                processedLine = line.replace(filePathPattern, (match, path) => {
                    // Check if the path is a valid file (has extension) and is either:
                    // 1. Has a path separator (directory/file.ext)
                    // 2. Is an absolute path (/file.ext)
                    // 3. Is a file in the current directory (file.ext) with optional line number
                    if (path.includes('/') || path.startsWith('/') || /^[a-zA-Z_][a-zA-Z0-9_.-]*\.[a-zA-Z0-9]+(?::\d+)?/.test(path)) {
                        // Get workspace directory for relative paths
                        const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        
                        // Check if the path has extra text after line number (pattern: file.ext:45:extra)
                        const lineNumberWithExtraMatch = path.match(/^(.+\.[a-zA-Z0-9]+:\d+)(:.+)$/);
                        if (lineNumberWithExtraMatch) {
                            // Insert space after line number: file.ext:45:extra -> file://file.ext:45 :extra
                            const pathWithLineNumber = lineNumberWithExtraMatch[1];
                            const extraText = lineNumberWithExtraMatch[2];
                            
                            // Handle relative vs absolute paths
                            if (pathWithLineNumber.startsWith('/')) {
                                // Absolute path: file:///absolute/path
                                return match.replace(path, `file://${pathWithLineNumber} ${extraText}`);
                            } else {
                                // Relative path: prepend workspace directory with proper file URI format
                                return match.replace(path, `file://${workspaceDir}/${pathWithLineNumber} ${extraText}`);
                            }
                        } else {
                            // Normal case without extra text
                            if (path.startsWith('/')) {
                                // Absolute path: file:///absolute/path
                                return match.replace(path, `file://${path}`);
                            } else {
                                // Relative path: prepend workspace directory with proper file URI format
                                return match.replace(path, `file://${workspaceDir}/${path}`);
                            }
                        }
                    }
                    return match;
                });
            }
            
            return processedLine;
        });
        
        return processedLines.join('\n');
    }
}
