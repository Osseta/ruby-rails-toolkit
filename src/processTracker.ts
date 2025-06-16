import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import type { ProcessTerminationReason } from './types';
import { workspaceHash } from './utils';
import { getLogger } from './logger';
import { FsHelper } from './fsHelper';

/**
 * Manages process tracking using PID files in a user-specific directory.
 * Used for both Ruby (with or without rdbg) and shell commands.
 * Also tracks process termination reasons and workspace hash to determine proper icon display.
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
        if (!FsHelper.existsSync(this.getPidDir())) {
            FsHelper.mkdirSync(this.getPidDir(), { recursive: true });
        }
    }

    /**
     * Ensures the state directory exists.
     */
    static ensureStateDir(): void {
        if (!FsHelper.existsSync(this.getStateDir())) {
            FsHelper.mkdirSync(this.getStateDir(), { recursive: true });
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
        
        // Read existing state to preserve workspace hash
        const existingState = this.readState(code);
        const state = {
            terminationReason: reason,
            workspaceHash: existingState.workspaceHash
        };
        
        FsHelper.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
    }

    /**
     * Gets the termination reason for a process.
     */
    static getTerminationReason(code: string): ProcessTerminationReason {
        const state = this.readState(code);
        return state.terminationReason || 'none';
    }

    /**
     * Clears the termination reason for a process.
     */
    static clearTerminationReason(code: string): void {
        const stateFile = this.getStateFilePath(code);
        if (FsHelper.existsSync(stateFile)) {
            FsHelper.unlinkSync(stateFile);
        }
    }

    /**
     * Sets the workspace hash for a process.
     */
    static setWorkspaceHash(code: string, hash: string): void {
        this.ensureStateDir();
        const stateFile = this.getStateFilePath(code);
        
        // Read existing state to preserve termination reason
        const existingState = this.readState(code);
        const state = {
            terminationReason: existingState.terminationReason || 'none',
            workspaceHash: hash
        };
        
        FsHelper.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
    }

    /**
     * Gets the workspace hash for a process.
     */
    static getWorkspaceHash(code: string): string | undefined {
        const state = this.readState(code);
        return state.workspaceHash;
    }

    /**
     * Clears the workspace hash for a process.
     */
    static clearWorkspaceHash(code: string): void {
        this.ensureStateDir();
        const stateFile = this.getStateFilePath(code);
        
        if (FsHelper.existsSync(stateFile)) {
            // Read existing state to preserve termination reason
            const existingState = this.readState(code);
            
            if (existingState.terminationReason) {
                // Preserve termination reason, only remove workspace hash
                const state = {
                    terminationReason: existingState.terminationReason
                    // workspaceHash is intentionally omitted
                };
                FsHelper.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
            } else {
                // No termination reason to preserve, delete the file
                FsHelper.unlinkSync(stateFile);
            }
        }
    }

    /**
     * Reads the state file for a process.
     */
    private static readState(code: string): { terminationReason?: ProcessTerminationReason, workspaceHash?: string } {
        const stateFile = this.getStateFilePath(code);
        if (!FsHelper.existsSync(stateFile)) {
            return {};
        }
        
        try {
            const content = FsHelper.readFileSync(stateFile, 'utf8').trim();
            // Handle both old format (string) and new format (JSON)
            if (content.startsWith('{')) {
                return JSON.parse(content);
            } else {
                // Old format - just termination reason as string
                return { terminationReason: content as ProcessTerminationReason };
            }
        } catch {
            return {};
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
     * @param additionalForbiddenVars Additional environment variables to exclude
     * @returns Promise that resolves with the spawned ChildProcess when the process is ready
     */
    static async spawnAndTrack({ 
        code, 
        command, 
        args = [], 
        options = {},
        additionalForbiddenVars = []
    }: { 
        code: string, 
        command: string, 
        args?: string[], 
        options?: any,
        additionalForbiddenVars?: string[]
    }): Promise<ChildProcessWithoutNullStreams> {
        const logger = getLogger();
        logger.info(`Spawning and tracking process: ${code}`, { command, args });
        
        this.ensurePidDir();
        // Clear any previous termination reason when starting a new process
        this.clearTerminationReason(code);
        
        // Store the current workspace hash for this process
        const currentWorkspaceHash = workspaceHash();
        this.setWorkspaceHash(code, currentWorkspaceHash);
        logger.debug(`Set workspace hash for ${code}`, { workspaceHash: currentWorkspaceHash });
        
        // Create or reuse output channel
        let outputChannel = this.outputChannels.get(code);
        if (!outputChannel) {
            // outputChannels use the default language `Log`. Although you can set a specific language if 
            // needed it breaks the file linking :-(
            // This extension instead extends the `Log` language to support ANSI colors and other rails
            // specific features.
            outputChannel = vscode.window.createOutputChannel(`Run: ${code}`);            
            this.outputChannels.set(code, outputChannel);
            logger.debug(`Created new output channel for ${code}`);
        } else {
            // Clear existing output channel contents when starting a new process (if setting is enabled)
            const config = vscode.workspace.getConfiguration('rubyToolkit');
            const clearOutputOnRun = config.get<boolean>('clearOutputChannelOnProcessRun', true);
            if (clearOutputOnRun) {
                outputChannel.clear();
                logger.debug(`Cleared existing output channel for ${code}`);
            }
        }

        // Prepare environment: copy process.env and remove specific variables
        const forbiddenVars = [
            'RBENV_DIR', 'RBENV_HOOK_PATH', 'RBENV_ORIG_PATH',
            'RBENV_ROOT', 'RBENV_VERSION', 'RUBYLIB', 'BUNDLE_GEMFILE',
            ...additionalForbiddenVars
        ];
        const env = { ...process.env };
        for (const v of forbiddenVars) {
            delete env[v];
        }
        
        return new Promise((resolve, reject) => {
            const shell = process.env.SHELL || 'zsh';
            const child = spawn(shell, ['-c', `echo ${command}; ${command} ${args.join(' ')}`], {
              env,
              cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
            
            // Handle spawn errors
            child.on('error', (error) => {
                logger.error(`Failed to spawn process ${code}`, { error });
                reject(error);
                return;
            });
            
            const pidFile = this.getPidFilePath(code);
            
            // Wait for the process to actually start before writing PID file and resolving
            let hasStarted = false;
            let startupTimer: NodeJS.Timeout;
            
            const markAsStarted = () => {
                if (hasStarted) {
                    return;
                }
                hasStarted = true;
                
                if (startupTimer) {
                    clearTimeout(startupTimer);
                }
                
                // Write PID file only after process has actually started
                FsHelper.writeFileSync(pidFile, String(child.pid));
                logger.info(`Process spawned successfully: ${code}`, { 
                    pid: child.pid, 
                    pidFile,
                    shell,
                    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath 
                });
                
                resolve(child);
            };
            
            // Consider the process started when it produces any output
            const onData = () => {
                markAsStarted();
            };
            
            child.stdout?.once('data', onData);
            child.stderr?.once('data', onData);
            
            // Fallback: consider started after a delay even without output
            startupTimer = setTimeout(() => {
               // reject(new Error(`Process ${code} did not produce output within 5 seconds, assuming it has started.`));
                markAsStarted();
            }, 5000);
            
            // Handle immediate exit (before startup)
            child.on('exit', (exitCode: number | null, signal: string | null) => {
                if (!hasStarted) {
                    logger.error(`Process ${code} exited before startup`, { exitCode, signal, pid: child.pid });
                    reject(new Error(`Process ${code} exited immediately with code ${exitCode}${signal ? `, signal ${signal}` : ''}`));
                    return;
                }
                
                logger.info(`Process ${code} exited`, { exitCode, signal, pid: child.pid });
                
                if (FsHelper.existsSync(pidFile)) {
                    FsHelper.unlinkSync(pidFile);
                    logger.debug(`Removed PID file for ${code}`, { pidFile });
                }
                
                // Determine termination reason BEFORE clearing workspace hash
                const currentReason = this.getTerminationReason(code);
                if (currentReason === 'none') {
                    // Process exited without user intervention, mark as crashed
                    logger.warn(`Process ${code} crashed unexpectedly`, { exitCode, signal });
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
                
                // Clean up workspace hash after handling termination reason
                this.clearWorkspaceHash(code);
                
                outputChannel.appendLine(`\n[Process exited with code ${exitCode}${signal ? `, signal ${signal}` : ''}]`);
            });
            
            // Set up output handling after startup detection
            child.stdout?.on('data', (data: Buffer) => {
                const processedData = this.preprocessOutputData(data.toString(), code);
                outputChannel.append(processedData);
            });
            child.stderr?.on('data', (data: Buffer) => {
                const processedData = this.preprocessOutputData(data.toString(), code);
                outputChannel.append(processedData);
            });
        });
    }

    /**
     * Checks if a process for the given code is running.
     * @param code Command code
     * @returns true if running, false otherwise
     */
    static isRunning(code: string): boolean {
        const pidFile = this.getPidFilePath(code);
        if (!FsHelper.existsSync(pidFile)) {return false;}
        const pid = parseInt(FsHelper.readFileSync(pidFile, 'utf8'));
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            FsHelper.unlinkSync(pidFile);
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
        if (!FsHelper.existsSync(pidFile)) {
            return undefined;
        }
        const pid = parseInt(FsHelper.readFileSync(pidFile, 'utf8'));
        try {
            process.kill(pid, 0);
            return pid;
        } catch {
            FsHelper.unlinkSync(pidFile);
            return undefined;
        }
    }

    /**
     * Waits for a process to stop, with timeout and force kill fallback.
     * This function can be mocked in tests for predictable behavior.
     * @param pid Process ID to poll
     * @param code Command code for logging/cleanup
     * @param pidFile Path to the PID file for cleanup
     * @param timeout Timeout in milliseconds (default: 30 seconds)
     * @returns Promise that resolves when the process has stopped
     * @private
     */
    private static waitForProcessStop(pid: number, code: string, pidFile: string, timeout: number = 30000): Promise<void> {
        const startTime = Date.now();
        const maxRetries = Math.ceil(timeout / 50); // 50ms polling interval
        let retryCount = 0;
        const logger = getLogger();

        return new Promise<void>((resolve) => {
            const pollProcess = () => {
                try {
                    // Check if process is still running
                    process.kill(pid, 0);
                    
                    retryCount++;
                    
                    // Check timeout or max retries
                    if (Date.now() - startTime > timeout || retryCount >= maxRetries) {
                        // Timeout reached, force kill the process
                        try {
                            process.kill(pid, 'SIGKILL');
                            logger.warn(`Forcefully killed process ${code} with PID ${pid} after timeout`);
                            console.warn(`Process ${pid} (${code}) did not stop gracefully within ${timeout/1000} seconds, forcefully killed`);
                        } catch {
                            // Process might have died between checks
                        }
                        // Clean up and resolve
                        if (FsHelper.existsSync(pidFile)) {
                            FsHelper.unlinkSync(pidFile);
                        }
                        this.clearWorkspaceHash(code);
                        resolve();
                        return;
                    }
                    
                    // Process still running, continue polling after a short delay
                    setTimeout(pollProcess, 50);
                    logger.debug(`Polling process ${code} with PID ${pid}, retry count: ${retryCount}`);
                } catch {
                    // Process has stopped (process.kill(pid, 0) threw an error)
                    if (FsHelper.existsSync(pidFile)) {
                        FsHelper.unlinkSync(pidFile);
                    }
                    this.clearWorkspaceHash(code);
                    logger.info(`Process ${code} with PID ${pid} has stopped gracefully`);
                    resolve();
                }
            };

            // Start polling after a short delay to give the process time to react to SIGTERM
            setTimeout(pollProcess, 50);
        });
    }

    /**
     * Stops the process for the given code, if running.
     * Polls the process to ensure it has stopped within 30 seconds.
     * If the process doesn't stop gracefully, it will be forcefully killed.
     * @param code Command code
     * @returns Promise that resolves when the process has fully stopped
     */
    static async stopProcess(code: string): Promise<void> {
        const logger = getLogger();
        const pidFile = this.getPidFilePath(code);
        
        if (!FsHelper.existsSync(pidFile)) {
            logger.debug(`No PID file found for ${code}, process not running`);
            return;
        }
        
        // Mark as user-requested termination before killing the process
        this.setTerminationReason(code, 'user-requested');
        logger.debug(`Set termination reason to 'user-requested' for ${code}`);
        
        const pid = parseInt(FsHelper.readFileSync(pidFile, 'utf8'));
        logger.info(`Stopping process ${code}`, { pid });
        
        // First attempt: graceful termination with SIGTERM
        try {
            process.kill(pid, 'SIGTERM');
            logger.debug(`Sent SIGTERM to process ${code}`, { pid });
        } catch (error) {
            // Process might already be dead
            logger.debug(`Failed to send SIGTERM to process ${code}`, { pid, error });
            if (FsHelper.existsSync(pidFile)) {
                FsHelper.unlinkSync(pidFile);
            }
            this.clearWorkspaceHash(code);
            return;
        }

        // Wait for the process to actually stop
        await ProcessTracker.waitForProcessStop(pid, code, pidFile);
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
        return FsHelper.readdirSync(this.getPidDir())
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
            const stateFiles = FsHelper.readdirSync(this.getStateDir())
                .filter(f => f.endsWith('.state'));
            for (const file of stateFiles) {
                FsHelper.unlinkSync(path.join(this.getStateDir(), file));
            }
        } catch (error) {
            // Directory might not exist or be empty, which is fine
        }
    }

    /**
     * Clears all workspace hashes. Used during cleanup.
     */
    static clearAllWorkspaceHashes(): void {
        // This method is now a no-op since workspace hashes are stored in state files
        // and cleared automatically when clearAllTerminationReasons() is called
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
            const config = vscode.workspace.getConfiguration('rubyToolkit');
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
            let trimmedLine = line.trim();
            
            // Handle Rails render commands first
            if (trimmedLine.startsWith('Rendered') && !line.includes('file://') && !trimmedLine.startsWith('Rendering')) {
                // Pattern to match Rails render commands like:
                // Rendered cart/_order_display.html.slim (Duration: 6.5ms | Allocations: 22377)
                // Rendered order/view.html.slim within layouts/application (Duration: 195.7ms | Allocations: 177750)
                // Rendered layout layouts/application.html.erb (Duration: 280.9ms | Allocations: 263813)
                const railsRenderPattern = /^(\s*)Rendered\s+(layout\s+)?([^\s(]+\.[a-zA-Z0-9]+)(\s+within\s+[^\s(]+)?(\s+\(.+)/;
                const match = line.match(railsRenderPattern);
                
                if (match) {
                    const indent = match[1];
                    const layoutPrefix = match[2] || '';
                    const viewPath = match[3];
                    const withinClause = match[4] || '';
                    const remaining = match[5] || '';
                    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    
                    // Convert view path to file URI with app/views/ prefix
                    const fullViewPath = `file://${workspaceDir}/app/views/${viewPath}`;
                    processedLine = `${indent}Rendered ${layoutPrefix}${fullViewPath}${withinClause}${remaining}`;
                }
            }
            // Only process if the line doesn't already contain 'file://'
            // is not a StatsD log line, and does not contain 'Rendered' to avoid matching
            // rails view rendering log which don't include full file information.
            else if (!line.includes('file://') && !line.includes('[StatsD]') && !trimmedLine.startsWith('Rendering layout')) {
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
