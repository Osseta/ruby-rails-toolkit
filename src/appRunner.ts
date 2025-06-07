import * as vscode from 'vscode';
import { runCommand, stopCommand, debugCommand, loadAppConfig, stopAllCommands } from './appCommand';
import { ProcessTracker } from './processTracker';
import { CommandStateManager } from './commandStateManager';
import type { Commands, Command, ProcessState } from './types';
import { workspaceHash } from './utils';

/**
 * Represents a single command in the App Runner TreeView, with state-based icon, label, tooltip, and context value.
 */
export class AppCommandTreeItem extends vscode.TreeItem {
    public readonly code: string;
    public readonly running: boolean;
    public readonly cmd: Command;

    constructor(cmd: Command, state?: ProcessState) {
        // Provide default state if not supplied
        const safeState = state || { exists: false, debugActive: false, terminationReason: 'none', hasOutputChannel: false, isLocked: false, workspaceHash: undefined };
        // Set label from command description
        super(cmd.description, vscode.TreeItemCollapsibleState.None);
        this.cmd = cmd;
        this.code = cmd.code;
        this.running = safeState.exists;
        
        // Check if process is from different workspace
        const currentWorkspace = workspaceHash();
        const isDifferentWorkspace = safeState.exists && safeState.workspaceHash && safeState.workspaceHash !== currentWorkspace;
        
        // Add red styling for crashed commands
        if (safeState.terminationReason === 'crashed') {
            // Use a prominent red description to make the crash status clear
            this.description = '(CRASHED)';
            // Set resource URI for potential future styling
            this.resourceUri = vscode.Uri.parse(`crashed-command:${cmd.code}`);
        } else if (isDifferentWorkspace) {
            this.description = '(DIFFERENT WORKSPACE)';
        }
        
        // Set icon based on locked state first, then running state and termination reason
        if (safeState.isLocked) {
            this.iconPath = new (vscode as any).ThemeIcon('loading~spin');
        } else if (safeState.exists) {
            if (isDifferentWorkspace) {
                // Orange icon for processes from different workspace
                this.iconPath = new (vscode as any).ThemeIcon('circle-large-filled', new vscode.ThemeColor('appRunner.differentWorkspace.foreground'));
            } else {
                // Green icon for processes from current workspace
                this.iconPath = new (vscode as any).ThemeIcon('circle-large-filled', new vscode.ThemeColor('appRunner.runningCommand.foreground'));
            }
        } else if (safeState.terminationReason === 'crashed') {
            this.iconPath = new (vscode as any).ThemeIcon('testing-error-icon', new vscode.ThemeColor('errorForeground'));
        } else {
            this.iconPath = new (vscode as any).ThemeIcon('circle-large-outline');
        }
        
        // Set contextValue based on new button visibility rules
        const capabilities: string[] = [];
        
        if (!safeState.exists) {
            // Process is not running
            if (safeState.terminationReason === 'crashed') {
                // Crashed: show output channel view button
                if (safeState.hasOutputChannel) {
                    capabilities.push('canShowOutputCrashed');
                }
            } else {
                // Not crashed: show run button
                capabilities.push('canRun');
            }
        } else {
            // Process is running: show output channel button
            if (safeState.hasOutputChannel) {
                capabilities.push('canShowOutputRunning');
            }
            
            // Keep stop and debug capabilities for QuickPick menu (not for inline buttons)
            capabilities.push('canStop');
            
            // Add debug capability for ruby commands when running but not already debugging
            // Disable debug for processes from different workspaces
            if (cmd.commandType === 'ruby' && !safeState.debugActive && !isDifferentWorkspace) {
                capabilities.push('canDebug');
            }
        }
        
        // Add general output capability for QuickPick menu
        if (safeState.hasOutputChannel) {
            capabilities.push('canShowOutput');
        }
        
        this.contextValue = capabilities.join(',');
        // Set tooltip
        let tooltipText = `${cmd.description}\n${cmd.command}`;
        if (isDifferentWorkspace) {
            tooltipText += '\n⚠️ Running in different workspace';
        }
        this.tooltip = tooltipText;
        // No command property set, so clicking does nothing (allows for selection/focus)
    }
}

/**
 * Provides a TreeView-based UI for running, stopping, and debugging the Rails server using VS Code native UI components.
 * Implements vscode.TreeDataProvider to supply tree items and handle refreshes.
 */
export class AppRunnerTreeDataProvider implements vscode.TreeDataProvider<AppCommandTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AppCommandTreeItem | null | undefined> = new vscode.EventEmitter<AppCommandTreeItem | null | undefined>();
    readonly onDidChangeTreeData: vscode.Event<AppCommandTreeItem | null | undefined> = this._onDidChangeTreeData.event;
    private commands: Command[] = [];
    private stateMap: Record<string, ProcessState> = {};
    private stateManager?: CommandStateManager;

    constructor() {
        this.refresh();
    }

    /**
     * Refreshes the command list and state, and updates the TreeView.
     * Called internally and can be triggered by commands or events.
     */
    async refresh(): Promise<void> {
        const config = loadAppConfig();
        this.commands = config.commands;
        // Always re-instantiate CommandStateManager to avoid private member access
        if (this.stateManager) {
            this.stateManager.dispose();
        }
        this.stateManager = new CommandStateManager({
            onUpdate: () => this._onDidChangeTreeData.fire(null)
        }, this.commands);
        // Update stateMap on every update
        const updateStateMap = () => {
            this.stateMap = {};
            this.commands.forEach(cmd => {
                this.stateMap[cmd.code] = this.stateManager!.getButtonState(cmd.code);
            });
        };
        updateStateMap();
        // Patch onUpdate to also update stateMap
        const origOnUpdate = this.stateManager["onUpdate"];
        this.stateManager["onUpdate"] = () => {
            updateStateMap();
            origOnUpdate();
        };
        // Force an initial poll to update state
        await this.stateManager["pollSessionStates"]();
    }

    /**
     * Returns the TreeItem representation for a given element.
     * Required by vscode.TreeDataProvider. VS Code calls this method to obtain the UI representation (label, icon, tooltip, etc.) for each element in the tree.
     * @param element The AppCommandTreeItem to represent
     * @returns The TreeItem for the given element
     */
    getTreeItem(element: AppCommandTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Returns the children of a given element or root elements if no element is provided.
     * Required by vscode.TreeDataProvider. VS Code calls this method to build the tree structure, recursively requesting children for each node.
     * For a flat tree, only the root call returns items.
     * @param element The parent element, or undefined for root
     * @returns A promise resolving to an array of AppCommandTreeItem children
     */
    getChildren(element?: AppCommandTreeItem): Thenable<AppCommandTreeItem[]> {
        if (!element) {
            // Only show each command as a tree item (no Run All/Stop All)
            const items: AppCommandTreeItem[] = this.commands.map(cmd => {
                return new AppCommandTreeItem(cmd, this.stateMap[cmd.code]);
            });
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }
}

/**
 * Registers the AppRunner TreeView and related commands with VS Code.
 * @param context The extension context for registering disposables.
 */
export function registerAppRunnerTreeView(context: vscode.ExtensionContext) {
    const provider = new AppRunnerTreeDataProvider();
    const treeView = vscode.window.createTreeView('appRunnerTreeView', { treeDataProvider: provider });
    context.subscriptions.push(treeView);

    // Refresh on debug session start/stop to update button states
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(() => provider.refresh()));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(() => provider.refresh()));

    context.subscriptions.push(vscode.commands.registerCommand('appRunner.refresh', () => provider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.runAll', async () => {
        const config = loadAppConfig();
        for (const cmd of config.commands) {
            if (!ProcessTracker.isRunning(cmd.code)) {
                await runCommand(cmd);
            }
        }
        await provider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.stopAll', async () => {
        await stopAllCommands();
        await provider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.run', async (item: AppCommandTreeItem) => {
        if (item.cmd) {
            await runCommand(item.cmd);
            await provider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.stop', async (item: AppCommandTreeItem) => {
        if (item.cmd) {
            await stopCommand(item.cmd);
            await provider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.debug', async (item: AppCommandTreeItem) => {
        if (item.cmd) {
            await debugCommand(item.cmd);
            await provider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.showOutput', async (item: AppCommandTreeItem) => {
        if (item.cmd) {
            const outputChannel = ProcessTracker.getOutputChannel(item.cmd.code);
            if (outputChannel) {
                outputChannel.show(true);
            }
        }
    }));
    
    // Register the QuickPick dropdown command
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.showQuickPick', async (item: AppCommandTreeItem) => {
        if (!item.cmd) {
            return;
        }
        
        const cmd = item.cmd;
        const actions: vscode.QuickPickItem[] = [];
        
        // Get the exact same state used for button display from the provider
        const state = provider['stateMap'][cmd.code] || { 
            exists: false, 
            debugActive: false, 
            terminationReason: 'none', 
            hasOutputChannel: false,
            workspaceHash: undefined
        };
        
        // Check if process is from different workspace
        const currentWorkspace = workspaceHash();
        const isDifferentWorkspace = state.exists && state.workspaceHash && state.workspaceHash !== currentWorkspace;
        
        // Use the exact same logic as the TreeItem contextValue to determine available actions
        if (!state.exists) {
            // When not running: only Run and Show Output (if available)
            actions.push({
                label: "$(run) Run",
                description: "Start the command",
                detail: cmd.command
            });
        } else if (state.exists && !state.debugActive) {
            // When running but not debugging: Stop, Debug (for Ruby), Show Output
            actions.push({
                label: "$(debug-stop) Stop",
                description: "Stop the running command",
                detail: cmd.command
            });
            
            // Only include Debug for Ruby commands, not shell commands
            // Disable debug for processes from different workspaces
            if (cmd.commandType === 'ruby' && !isDifferentWorkspace) {
                actions.push({
                    label: "$(debug) Debug",
                    description: "Attach debugger to running command", 
                    detail: cmd.command
                });
            }
        } else if (state.exists && state.debugActive) {
            // When running and debugging: only Stop and Show Output (no Debug button)
            actions.push({
                label: "$(debug-stop) Stop",
                description: "Stop the running command",
                detail: cmd.command
            });
        }
        
        // Show Output if available (regardless of running state)
        if (state.hasOutputChannel) {
            actions.push({
                label: "$(terminal-view-icon) Show Output",
                description: "Open the output channel",
                detail: "View command output"
            });
        }
        
        // Show the quick pick menu
        const selectedAction = await vscode.window.showQuickPick(actions, {
            placeHolder: `Choose action for ${cmd.description}`,
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selectedAction) {
            return;
        }
        
        // Execute the selected action
        if (selectedAction.label.includes('Run')) {
            await runCommand(cmd);
            await provider.refresh();
        } else if (selectedAction.label.includes('Debug')) {
            await debugCommand(cmd);
            await provider.refresh();
        } else if (selectedAction.label.includes('Stop')) {
            await stopCommand(cmd);
            await provider.refresh();
        } else if (selectedAction.label.includes('Show Output')) {
            const outputChannel = ProcessTracker.getOutputChannel(cmd.code);
            if (outputChannel) {
                outputChannel.show(true);
            }
        }
    }));
}
