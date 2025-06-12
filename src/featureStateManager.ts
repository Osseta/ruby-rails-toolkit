import * as vscode from 'vscode';
import { getLogger } from './logger';

/**
 * Manages the enabled/disabled state of features in the workspace.
 * State is persisted in workspace-specific storage.
 */
export class FeatureStateManager {
    private static readonly FEATURE_STATE_KEY = 'ruby-rails-toolkit.featureStates';
    private context: vscode.ExtensionContext;
    private logger = getLogger();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.logger.debug('FeatureStateManager initialized');
    }

    /**
     * Gets the enabled state for a feature.
     * @param featureCode The feature code
     * @returns true if enabled, false if disabled
     */
    isFeatureEnabled(featureCode: string): boolean {
        const states = this.getAllFeatureStates();
        // Features are disabled by default
        return states[featureCode] || false;
    }

    /**
     * Sets the enabled state for a feature.
     * @param featureCode The feature code
     * @param enabled Whether the feature should be enabled
     */
    async setFeatureEnabled(featureCode: string, enabled: boolean): Promise<void> {
        const states = this.getAllFeatureStates();
        states[featureCode] = enabled;
        
        await this.context.workspaceState.update(FeatureStateManager.FEATURE_STATE_KEY, states);
        this.logger.debug(`Feature ${featureCode} ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Toggles the enabled state for a feature.
     * @param featureCode The feature code
     * @returns The new enabled state
     */
    async toggleFeature(featureCode: string): Promise<boolean> {
        const currentState = this.isFeatureEnabled(featureCode);
        const newState = !currentState;
        await this.setFeatureEnabled(featureCode, newState);
        return newState;
    }

    /**
     * Gets all feature states.
     * @returns Object mapping feature codes to their enabled states
     */
    getAllFeatureStates(): Record<string, boolean> {
        return this.context.workspaceState.get(FeatureStateManager.FEATURE_STATE_KEY, {});
    }

    /**
     * Gets the environment variables that should be excluded from process spawning
     * based on current feature states.
     * @param features The available features
     * @returns Array of environment variable names to exclude
     */
    getForbiddenEnvironmentVariables(features: import('./types').Feature[]): string[] {
        const forbidden: string[] = [];
        
        for (const feature of features) {
            const isEnabled = this.isFeatureEnabled(feature.code);
            
            if (!isEnabled) {
                // Feature is disabled: add whitelist items to forbidden list
                forbidden.push(...feature.environment.whitelist);
            } else {
                // Feature is enabled: add blacklist items to forbidden list
                forbidden.push(...feature.environment.blacklist);
            }
        }
        
        // Remove duplicates
        return Array.from(new Set(forbidden));
    }
}
