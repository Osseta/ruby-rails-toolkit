import * as vscode from 'vscode';
import { ProcessTracker } from './processTracker';
import { FileLockManager } from './fileLockManager';
import type { ProcessState } from './types';
import { workspaceHash } from './utils';

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

    constructor({ onUpdate }: { onUpdate: () => void }, commands: any[]) {
        this.onUpdate = onUpdate;
        this.commands = commands;
        this.init();
    }

    private async init() {
        await this.pollSessionStates();
        this.startPolling();
    }

    private async pollSessionStates() {
        const currentWorkspace = workspaceHash();
        
        this.commands.forEach((cmd: any) => {
            const exists = ProcessTracker.isRunning(cmd.code);
            let terminationReason = ProcessTracker.getTerminationReason(cmd.code);
            const hasOutputChannel = ProcessTracker.hasOutputChannel(cmd.code);
            const isLocked = FileLockManager.isLocked(cmd.code);
            const processWorkspaceHash = ProcessTracker.getWorkspaceHash(cmd.code);
            
            // If termination reason is crashed but there's no output channel, change to none
            if (terminationReason === 'crashed' && !hasOutputChannel) {
                terminationReason = 'none';
            }
            
            this.setButtonState(cmd.code, { 
                exists, 
                debugActive: false,
                terminationReason,
                hasOutputChannel,
                isLocked,
                workspaceHash: processWorkspaceHash
            });
        });
        this.updateTreeView();
    }

    private startPolling() {
        this.pollingInterval = setInterval(() => this.pollSessionStates(), 2000);
    }

    private setButtonState(code: string, state: ProcessState) {
        this.buttonStates[code] = state;
    }

    public getButtonState(code: string): ProcessState {
        return this.buttonStates[code] || { exists: false, debugActive: false, terminationReason: 'none', hasOutputChannel: false, isLocked: false, workspaceHash: undefined };
    }

    private updateTreeView() {
        this.onUpdate();
    }

    public dispose() {
        clearInterval(this.pollingInterval);
    }
}
