import * as vscode from 'vscode';
import { loadAppConfig } from './appCommand';
import { FeatureStateManager } from './featureStateManager';
import { Feature } from './types';
import { getLogger } from './logger';

/**
 * Represents a single feature in the Features TreeView, with checkbox state.
 */
export class FeatureTreeItem extends vscode.TreeItem {
    public readonly feature: Feature;
    public readonly isEnabled: boolean;

    constructor(feature: Feature, isEnabled: boolean) {
        super(feature.name, vscode.TreeItemCollapsibleState.None);
        
        this.feature = feature;
        this.isEnabled = isEnabled;
        
        // Set checkbox state
        this.checkboxState = isEnabled ? 
            vscode.TreeItemCheckboxState.Checked : 
            vscode.TreeItemCheckboxState.Unchecked;
        
        // Set description and tooltip
        this.description = feature.description;
        this.tooltip = this.buildTooltip();
        
        // Set context value for commands
        this.contextValue = 'feature';
    }

    private buildTooltip(): string {
        const state = this.isEnabled ? 'Enabled' : 'Disabled';
        const whitelist = this.feature.environment.whitelist.join(', ') || 'None';
        const blacklist = this.feature.environment.blacklist.join(', ') || 'None';
        
        return `${this.feature.name} (${state})
${this.feature.description}

Environment Variables:
• Whitelist: ${whitelist}
• Blacklist: ${blacklist}`;
    }
}

/**
 * Provides a TreeView-based UI for managing feature states with checkboxes.
 * Implements vscode.TreeDataProvider to supply tree items and handle checkbox changes.
 */
export class FeaturesTreeDataProvider implements vscode.TreeDataProvider<FeatureTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FeatureTreeItem | null | undefined> = new vscode.EventEmitter<FeatureTreeItem | null | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FeatureTreeItem | null | undefined> = this._onDidChangeTreeData.event;
    
    private features: Feature[] = [];
    private featureStateManager: FeatureStateManager;
    private logger = getLogger();

    constructor(featureStateManager: FeatureStateManager) {
        this.featureStateManager = featureStateManager;
        this.logger.info('Creating FeaturesTreeDataProvider');
        this.refresh();
    }

    /**
     * Refreshes the features list and updates the TreeView.
     */
    async refresh(): Promise<void> {
        this.logger.debug('Refreshing FeaturesTreeDataProvider');
        const config = loadAppConfig();
        this.features = config.features || [];
        this.logger.debug('Loaded features config', { featureCount: this.features.length });
        this._onDidChangeTreeData.fire(null);
    }

    /**
     * Returns the TreeItem representation for a given element.
     * @param element The FeatureTreeItem to represent
     * @returns The TreeItem for the given element
     */
    getTreeItem(element: FeatureTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Returns the children of a given element or root elements if no element is provided.
     * @param element The parent element, or undefined for root
     * @returns A promise resolving to an array of FeatureTreeItem children
     */
    getChildren(element?: FeatureTreeItem): Thenable<FeatureTreeItem[]> {
        if (!element) {
            // Root level: return all features as tree items
            const items: FeatureTreeItem[] = this.features.map(feature => {
                const isEnabled = this.featureStateManager.isFeatureEnabled(feature.code);
                return new FeatureTreeItem(feature, isEnabled);
            });
            return Promise.resolve(items);
        }
        // Features have no children
        return Promise.resolve([]);
    }

    /**
     * Handles checkbox state changes for features.
     * @param item The tree item that was checked/unchecked
     * @param state The new checkbox state
     */
    async onDidChangeCheckboxState(item: FeatureTreeItem, state: vscode.TreeItemCheckboxState): Promise<void> {
        const enabled = state === vscode.TreeItemCheckboxState.Checked;
        await this.featureStateManager.setFeatureEnabled(item.feature.code, enabled);
        
        this.logger.info(`Feature ${item.feature.code} ${enabled ? 'enabled' : 'disabled'} by user`);
        
        // Refresh the tree to update the display
        this.refresh();
    }

    /**
     * Gets the current feature state manager.
     * @returns The FeatureStateManager instance
     */
    getFeatureStateManager(): FeatureStateManager {
        return this.featureStateManager;
    }
}

/**
 * Registers the Features TreeView and related commands with VS Code.
 * @param context The extension context for registering disposables
 * @param featureStateManager The feature state manager instance
 */
export function registerFeaturesTreeView(context: vscode.ExtensionContext, featureStateManager: FeatureStateManager) {
    const logger = getLogger();
    logger.info('Registering Features TreeView and commands');
    
    const provider = new FeaturesTreeDataProvider(featureStateManager);
    const treeView = vscode.window.createTreeView('featuresTreeView', { 
        treeDataProvider: provider,
        showCollapseAll: false,
        canSelectMany: false
    });
    
    context.subscriptions.push(treeView);
    logger.debug('Features TreeView created and registered');

    // Handle checkbox state changes
    if (treeView.onDidChangeCheckboxState) {
        context.subscriptions.push(
            treeView.onDidChangeCheckboxState(async (e) => {
                for (const [item, state] of e.items) {
                    if (item instanceof FeatureTreeItem) {
                        await provider.onDidChangeCheckboxState(item, state);
                    }
                }
            })
        );
    }

    // Register refresh command
    context.subscriptions.push(vscode.commands.registerCommand('features.refresh', async () => {
        logger.info('Features refresh command executed');
        await provider.refresh();
    }));

    // Register toggle command (for context menu or programmatic use)
    context.subscriptions.push(vscode.commands.registerCommand('features.toggle', async (item: FeatureTreeItem) => {
        if (item && item.feature) {
            const newState = await featureStateManager.toggleFeature(item.feature.code);
            logger.info(`Feature ${item.feature.code} toggled to ${newState ? 'enabled' : 'disabled'}`);
            await provider.refresh();
        }
    }));

    logger.info('Features TreeView and commands registered successfully');
    return provider;
}
