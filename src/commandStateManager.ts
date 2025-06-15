import * as vscode from 'vscode';
import { ProcessTracker } from './processTracker';
import { FileLockManager } from './fileLockManager';
import type { ProcessState } from './types';
import { defaultProcessState } from './types';
import { workspaceHash } from './utils';
import { getLogger } from './logger';

/**
 * Manages the enabled/disabled state of command buttons in the AppRunner TreeView.
 * Uses ProcessTracker to determine running state and termination reasons.
 * Notifies the TreeView via an onUpdate callback.
 */
export class CommandStateManager {
    private buttonStates: Record<string, ProcessState> = {};
    private commands: any[];
    private pollingInterval: any;
    private onUpdate: () => void;
    private logger = getLogger();
    private activeDebugSessions: Map<string, vscode.DebugSession> = new Map();

    constructor({ onUpdate }: { onUpdate: () => void }, commands: any[]) {
        this.onUpdate = onUpdate;
        this.commands = commands;
        this.logger.debug('CommandStateManager constructor called', { commandCount: commands.length });
        
        // Start polling immediately to ensure pollingInterval is set
        this.startPolling();
        
        // Initialize states asynchronously
        this.init();
    }

    private async init() {
        this.logger.info('Initializing CommandStateManager');
        await this.pollSessionStates();
        this.onUpdate();
        this.logger.debug('CommandStateManager initialization complete');
    }

    private async pollSessionStates() {
        const currentWorkspace = workspaceHash();
        // this.logger.debug('Polling session states', { 
        //     currentWorkspace,
        //     commandCount: this.commands.length 
        // });
        let hasChanged = false;
        
        this.commands.forEach((cmd: any) => {
            const exists = ProcessTracker.isRunning(cmd.code);
            let terminationReason = ProcessTracker.getTerminationReason(cmd.code);
            const hasOutputChannel = ProcessTracker.hasOutputChannel(cmd.code);
            const isLocked = FileLockManager.isLocked(cmd.code);
            const processWorkspaceHash = ProcessTracker.getWorkspaceHash(cmd.code);
            
            // Check if there's an active debug session for this command
            const debugActive = this.isDebugSessionActive(cmd.code);
            
            // If termination reason is crashed but there's no output channel, change to none
            if (terminationReason === 'crashed' && !hasOutputChannel) {
                this.logger.info(`Command ${cmd.code}: changing termination reason from 'crashed' to 'none' (no output channel)`);
                terminationReason = 'none';
            }
            
            if (this.setButtonState(cmd.code, { 
                exists, 
                debugActive,
                terminationReason,
                hasOutputChannel,
                isLocked,
                workspaceHash: processWorkspaceHash
            })) { hasChanged = true; }
        });
        if (hasChanged) {
            this.updateTreeView();
        }
    }

    private startPolling() {
        this.logger.info('Starting CommandStateManager polling (2 second interval)');
        this.pollingInterval = setInterval(() => this.pollSessionStates(), 2000);
    }

    private setButtonState(code: string, state: ProcessState): boolean {
        const previousState = this.buttonStates[code];
        this.buttonStates[code] = state;
        
        const stateChanged = (!previousState || 
            previousState.exists !== state.exists ||
            previousState.debugActive !== state.debugActive ||
            previousState.terminationReason !== state.terminationReason ||
            previousState.isLocked !== state.isLocked);

        if (stateChanged) {
            this.logger.debug(`Command ${code} state changed`, {
                previous: previousState,
                current: state
            });
            return true;
        } else {
            return false;
        }
    }

    public getButtonState(code: string): ProcessState {
        return this.buttonStates[code] || defaultProcessState;
    }

    public getButtonStates(): Record<string, ProcessState> {
        return this.buttonStates;
    }

    /**
     * Forces an immediate poll of session states and updates the tree view.
     * Useful for showing immediate state changes like lock acquisition.
     */
    public async forceUpdate(): Promise<void> {
        this.logger.debug('Force updating CommandStateManager');
        await this.pollSessionStates();
    }

    private updateTreeView() {
        this.logger.debug('Updating tree view');
        this.onUpdate();
    }

    public dispose() {
        this.logger.info('Disposing CommandStateManager');
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            this.logger.debug('Polling interval cleared');
        }
    }

    /**
     * Registers a debug session for a command.
     * @param commandCode The command code
     * @param session The debug session
     */
    public registerDebugSession(commandCode: string, session: vscode.DebugSession): void {
        this.activeDebugSessions.set(commandCode, session);
        this.logger.debug(`Registered debug session for ${commandCode}`, { sessionId: session.id });
        this.pollSessionStates(); // Update states immediately
    }

    /**
     * Unregisters a debug session for a command.
     * @param session The debug session
     */
    public unregisterDebugSession(session: vscode.DebugSession): void {
        // Find the command code for this session
        for (const [commandCode, storedSession] of this.activeDebugSessions.entries()) {
            if (storedSession.id === session.id) {
                this.activeDebugSessions.delete(commandCode);
                this.logger.debug(`Unregistered debug session for ${commandCode}`, { sessionId: session.id });
                this.pollSessionStates(); // Update states immediately
                break;
            }
        }
    }

    /**
     * Checks if a debug session is active for a command.
     * @param commandCode The command code
     * @returns True if debug session is active
     */
    private isDebugSessionActive(commandCode: string): boolean {
        const session = this.activeDebugSessions.get(commandCode);
        if (!session) {
            return false;
        }

        // Check if session is for rdbg and matches our command
        const isRdbgSession = session.type === 'rdbg';
        const matchesCommand = session.name.includes(`(${commandCode})`);
        
        return isRdbgSession && matchesCommand;
    }

    /**
     * Gets the active debug session for a command, if any.
     * @param commandCode The command code
     * @returns The debug session or undefined
     */
    public getDebugSession(commandCode: string): vscode.DebugSession | undefined {
        return this.activeDebugSessions.get(commandCode);
    }
}
