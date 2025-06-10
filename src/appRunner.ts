import * as vscode from 'vscode';
import { runCommand, stopCommand, debugCommand, loadAppConfig, stopAllCommands, runAndDebugCommand, appCommandsFileExists, getDefaultAppConfig, setOnLockAcquiredCallback } from './appCommand';
import { ProcessTracker } from './processTracker';
import { CommandStateManager } from './commandStateManager';
import type { Commands, Command, ProcessState } from './types';
import { workspaceHash } from './utils';
import { getLogger } from './logger';

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
        if (isDifferentWorkspace) {
            this.description = '(DIFFERENT WORKSPACE)';
        } else if (safeState.terminationReason === 'crashed') {
            // Use a prominent red description to make the crash status clear
            this.description = '(CRASHED)';
            // Set resource URI for potential future styling
            this.resourceUri = vscode.Uri.parse(`crashed-command:${cmd.code}`);
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
    private stateManager?: CommandStateManager;
    private logger = getLogger();

    constructor() {
        this.logger.info('Creating AppRunnerTreeDataProvider');
        this.refresh();
    }

    public state(commandCode: string): ProcessState {
        return this.stateManager?.getButtonState(commandCode) || { 
            exists: false, 
            debugActive: false, 
            terminationReason: 'none', 
            hasOutputChannel: false, 
            isLocked: true, 
            workspaceHash: undefined 
        };
    }

    /**
     * Refreshes the command list and state, and updates the TreeView.
     * Called internally and can be triggered by commands or events.
     */
    async refresh(): Promise<void> {
        this.logger.debug('Refreshing AppRunnerTreeDataProvider');
        const config = loadAppConfig();
        this.commands = config.commands;
        this.logger.debug('Loaded app config', { commandCount: this.commands.length });
        
        // Always re-instantiate CommandStateManager to avoid private member access
        if (this.stateManager) {
            this.stateManager.dispose();
        }
        this.stateManager = new CommandStateManager({
            onUpdate: () => {
                this.logger.debug('CommandStateManager triggered tree view update');
                this._onDidChangeTreeData.fire(null);
            }
        }, this.commands);
        
        this.logger.debug('AppRunnerTreeDataProvider refresh complete');
    }

    /**
     * Forces an immediate state update to reflect changes like lock acquisition.
     * Useful for showing loading spinners immediately when operations start.
     */
    async forceUpdate(): Promise<void> {
        if (this.stateManager) {
            await this.stateManager.forceUpdate();
        }
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
                return new AppCommandTreeItem(cmd, this.stateManager?.getButtonState(cmd.code));
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
    const logger = getLogger();
    logger.info('Registering AppRunner TreeView and commands');
    
    const provider = new AppRunnerTreeDataProvider();
    const treeView = vscode.window.createTreeView('appRunnerTreeView', { treeDataProvider: provider });
    context.subscriptions.push(treeView);
    logger.debug('AppRunner TreeView created and registered');

    // Set up callback for immediate tree view updates when locks are acquired
    setOnLockAcquiredCallback(async () => {
        logger.debug('Lock acquired callback triggered');
        await provider.refresh();
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    // Refresh on debug session start/stop to update button states
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(() => {
        logger.debug('Debug session started, refreshing tree view');
        provider.refresh();
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(() => {
        logger.debug('Debug session terminated, refreshing tree view');
        provider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('appRunner.refresh', async () => {
        logger.info('Refresh command executed');
        // Always refresh - loadAppConfig() returns default commands if file doesn't exist
        await provider.refresh();
    }));
    
    // Register the menu command
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.showMenu', async () => {
        const quickPickItems: vscode.QuickPickItem[] = [
            {
                label: "$(refresh) Refresh Commands",
                description: "Reload commands from app_commands.jsonc file",
                detail: "Loads default commands if .vscode/app_commands.jsonc doesn't exist"
            },
            {
                label: "$(settings-gear) Open Settings",
                description: "Open app_commands.jsonc configuration file",
                detail: "Creates file with defaults if it doesn't exist"
            }
        ];
        
        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Choose an action",
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selected) {
            return;
        }
        
        if (selected.label.includes('Refresh')) {
            await vscode.commands.executeCommand('appRunner.refresh');
        } else if (selected.label.includes('Settings')) {
            await vscode.commands.executeCommand('appRunner.openSettings');
        }
    }));
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
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.runAndDebug', async (item: AppCommandTreeItem) => {
        if (item.cmd) {
            await runAndDebugCommand(item.cmd);
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
    
    // Register the settings command
    context.subscriptions.push(vscode.commands.registerCommand('appRunner.openSettings', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }
        
        const appCommandsPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'app_commands.jsonc');
        
        try {
            // Check if the file exists
            if (appCommandsFileExists()) {
                // File exists, open it
                const doc = await vscode.workspace.openTextDocument(appCommandsPath);
                await vscode.window.showTextDocument(doc);
            } else {
                // File doesn't exist, create it directly with default content
                const defaultConfig = getDefaultAppConfig();
                
                // Create JSONC content with helpful comments using standard comment syntax
                const commentHeader = `{
  // This is the App Runner configuration file for VS Code Ruby & Rails Toolkit
  // After making changes to this file, use the Menu > Refresh Commands option to reload
  
  // Command Configuration Options:
  // - code: unique identifier for the command
  // - description: display name shown in the App Runner panel
  // - command: the actual shell command to execute
  // - commandType: 'ruby' for Ruby processes (enables debugging) or 'shell' for other commands
`;
                
                // Remove the opening brace from the JSON and add our commented version
                const configJson = JSON.stringify(defaultConfig, null, 2);
                const configWithoutOpeningBrace = configJson.substring(1);
                const defaultContent = commentHeader + configWithoutOpeningBrace;
                
                try {
                    // Create .vscode directory if it doesn't exist
                    const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
                    try {
                        await vscode.workspace.fs.stat(vscodeDir);
                    } catch {
                        // Directory doesn't exist, create it
                        await vscode.workspace.fs.createDirectory(vscodeDir);
                    }
                    
                    // Write the content directly to the file
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(appCommandsPath, encoder.encode(defaultContent));
                    
                    // Open the saved file
                    const savedDoc = await vscode.workspace.openTextDocument(appCommandsPath);
                    await vscode.window.showTextDocument(savedDoc);
                    
                    vscode.window.showInformationMessage('App commands configuration created with default settings!');
                } catch (saveError) {
                    vscode.window.showErrorMessage(`Failed to create app commands configuration: ${saveError}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open app commands settings: ${error}`);
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
        const state = provider.state(cmd.code);
        
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
            
            // Add Run & Debug option for Ruby commands only
            if (cmd.commandType === 'ruby') {
                actions.push({
                    label: "$(debug-start) Run & Debug",
                    description: "Start the command and wait for debugger",
                    detail: cmd.command
                });
            }
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
        if (selectedAction.label.includes('Run & Debug')) {
            await runAndDebugCommand(cmd);
            await provider.refresh();
        } else if (selectedAction.label.includes('Run')) {
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
