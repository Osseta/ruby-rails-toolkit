import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { waitForRdbgSessionAndGetSocket, RDBG_SOCK_DIR, ensureRdbgSocketDirectory, getRdbgSocketDirEnvPrefix } from './rdbgSockets';
import { getOrCreateTerminal } from './utils';
import { listRdbgSocks } from './utils';
import { waitForRdbgSocket, startVSCodeDebugSession } from './appCommand';
import { ProcessTracker } from './processTracker';

// Utility: determine if a line is a spec/test line
/**
 * Determines if a line of Ruby code is a spec/test line (e.g., it, describe, scenario).
 * @param line The line of code to check.
 * @returns True if the line is a spec/test line, false otherwise.
 */
export function isSpecLine(line: string): boolean {
    const trimmed = line.trim();
    return (
        trimmed.startsWith('it ') ||
        trimmed.startsWith('describe ') ||
        trimmed.startsWith('RSpec.describe') ||
        trimmed.startsWith('scenario ') ||
        trimmed.startsWith('context ') ||
        trimmed.startsWith('feature ') ||
        trimmed.startsWith('shared_examples ')
    );
}

// Generic CodeLensProvider for spec lines
/**
 * Provides CodeLenses for spec lines in Ruby spec files, enabling run/debug actions.
 */
class SpecCodeLensProvider implements vscode.CodeLensProvider {
    private commandId: string;
    private title: string;
    private tooltip: string;

    constructor(commandId: string, title: string, tooltip: string) {
        this.commandId = commandId;
        this.title = title;
        this.tooltip = tooltip;
    }

    /**
     * Scans the document for spec lines and returns CodeLenses for each.
     * @param document The text document to scan.
     * @param _token Cancellation token (unused).
     * @returns An array of CodeLenses for spec lines.
     */
    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        if (!document.fileName.endsWith('_spec.rb')) {
            return [];
        }
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (isSpecLine(lines[i])) {
                const range = new vscode.Range(i, 0, i, lines[i].length);
                const command: vscode.Command = {
                    title: this.title,
                    command: this.commandId,
                    tooltip: this.tooltip,
                    arguments: [document.uri, range.start.line]
                };
                codeLenses.push(new vscode.CodeLens(range, command));
            }
        }
        return codeLenses;
    }
}

let rspecTerminal: vscode.Terminal | undefined;

/**
 * Activates the RSpec Runner extension, registering CodeLens providers and commands.
 * @param context The VS Code extension context.
 */
export function activate(context: vscode.ExtensionContext) {
    const debugCodeLensProvider = new SpecCodeLensProvider(
        'rspec-runner.debugRubySpec',
        '$(debug-alt)\u00A0Debug',
        'Debug this spec'
    );
    const runCodeLensProvider = new SpecCodeLensProvider(
        'rspec-runner.runRubySpec',
        '$(run)\u00A0Run',
        'Run this spec (headless)'
    );
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'ruby', pattern: '**/*_spec.rb' }, debugCodeLensProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'ruby', pattern: '**/*_spec.rb' }, runCodeLensProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.debugRubySpec', debugRubySpec)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.debugEntireRubySpec', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('_spec.rb')) {
                debugRubySpec(editor.document.uri, 0);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rspec-runner.runRubySpec', runRubySpec)
    );
}

/**
 * Launches rdbg in a terminal and attaches the VS Code debugger to a specific spec file/line.
 * @param uri The URI of the spec file.
 * @param line The line number to debug (0 for the whole file).
 */
// Remove all usage of launchRdbgInTerminal and startRdbgDebugger, and replace with direct rdbg invocation and VS Code debug attach logic using ProcessTracker approach.

async function debugRubySpec(uri: vscode.Uri, line: number) {
    const fullPath = uri.fsPath;
    const specIndex = fullPath.indexOf('spec/');
    let relativePath: string;
    if (specIndex !== -1) {
        relativePath = fullPath.substring(specIndex);
    } else {
        relativePath = path.basename(fullPath);
    }
    if (!rspecTerminal) {
        rspecTerminal = await getOrCreateTerminal('RSpec Runner');
    }
    // Build the rspec command with file and line
    const command = line === 0
        ? `bundle exec rspec ${relativePath}`
        : `bundle exec rspec ${relativePath}:${line + 1}`;
    
    // Check if custom socket directory should be used
    const config = vscode.workspace.getConfiguration('rubyToolkit');
    const useCustomSocketDir = config.get('useCustomRdbgSocketDirectory', true);
    
    if (useCustomSocketDir) {
        // Ensure socket directory exists
        ensureRdbgSocketDirectory();
    }
    
    // Start rdbg in the terminal with optional custom socket directory
    const envPrefix = getRdbgSocketDirEnvPrefix();
    const rdbgCmd = `${envPrefix}bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
    rspecTerminal.sendText(rdbgCmd);
    
    // Wait for the rdbg socket to appear and then start debugging
    const socketFile = await waitForRdbgSocket('_RSPEC');
    
    // Start VS Code debugger and attach to rdbg
    await startVSCodeDebugSession('RSpec', socketFile);
}

/**
 * Executes a command using Terminal Shell Integration and captures output.
 * @param terminal The terminal to use.
 * @param command The command to execute.
 * @param onData Callback function to handle captured data.
 * @returns Promise that resolves when command completes.
 */
async function executeCommandWithOutputCapture(
    terminal: vscode.Terminal,
    command: string,
    onData: (data: string) => void,
    onNoShellIntegration: () => void = () => {}
): Promise<void> {
    if (terminal.shellIntegration) {
        // Use shell integration to execute command and capture output
        const execution = terminal.shellIntegration.executeCommand(command);
        const stream = execution.read();
        for await (const data of stream) {
            onData(data);
        }
    } else {
        // Fallback: just send text if shell integration is not available
        terminal.sendText(command);
        console.warn('Shell integration not available, output capture not possible');
        onNoShellIntegration();
    }
}

/**
 * Enhanced version of runRubySpec using Shell Integration API for output capture.
 * @param uri The URI of the spec file.
 * @param line The line number to run (0 for the whole file).
 * @returns Promise that resolves when the command completes.
 */
async function runRubySpec(uri: vscode.Uri, line: number): Promise<void> {
    const fullPath = uri.fsPath;
    const specIndex = fullPath.indexOf('spec/');
    let relativePath: string;
    if (specIndex !== -1) {
        relativePath = fullPath.substring(specIndex);
    } else {
        relativePath = path.basename(fullPath);
    }
    
    if (!rspecTerminal) {
        rspecTerminal = await getOrCreateTerminal('RSpec Runner');
    }
    
    const baseCommand = `HEADLESS=1 bundle exec rspec`;
    const rspecCommand = line === 0
        ? `${baseCommand} ${relativePath}`
        : `${baseCommand} ${relativePath}:${line + 1}`;
    
    let capturedOutput = '';
    
    executeCommandWithOutputCapture(rspecTerminal, rspecCommand, (data) => {
        capturedOutput += data;
        console.log('RSpec output:', data);
        
        // DEBUGGER: Debugger can attach via UNIX domain socket (/var/folders/lp/wlkdydxs58qbz00vdx2bkdc80000gn/T/com.apple.shortcuts.mac-helper/rdbg-501/rdbg-70897)
        // DEBUGGER: wait for debugger connection...
         // extract the socket path from the output
        const socketMatch = data.match(/DEBUGGER: Debugger can attach via UNIX domain socket\s*\(([^)]+)\)/);
        if (socketMatch) {
            const socketPath = socketMatch[1];
            console.log('Debugger socket path:', socketPath);
        }

        // detect wait for debugger connection
        if (data.includes('wait for debugger connection...')) {
            console.log('Waiting for debugger connection...');
            // Here you could implement logic to wait for the debugger to connect
        }

        // Parse for PID or other information
        const pidMatch = data.match(/PID:\s*(\d+)/);
        if (pidMatch) {
            console.log('Found PID in output:', pidMatch[1]);
        }
        
        // Check for test completion
        if (data.includes('examples,') || data.includes('failures') || data.includes('Finished in')) {
            console.log('RSpec test completed');
        }
  }, () => {});
}

/**
 * Deactivates the RSpec Runner extension (no-op).
 */
export function deactivate() {}

// Export for testing
export { 
    SpecCodeLensProvider, 
    executeCommandWithOutputCapture,
    debugRubySpec,
};