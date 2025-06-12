import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeaturesTreeDataProvider, FeatureTreeItem } from '../featuresTreeView';
import { FeatureStateManager } from '../featureStateManager';
import { Feature } from '../types';
import * as appCommand from '../appCommand';

suite('Features TreeView Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let mockFeatureStateManager: FeatureStateManager;
    let provider: FeaturesTreeDataProvider;
    let loadAppConfigStub: sinon.SinonStub;

    const testFeatures: Feature[] = [
        {
            code: 'DEBUG',
            name: 'Debug Mode',
            description: 'Enables debugging flags',
            environment: {
                whitelist: ['DEBUG', 'VERBOSE'],
                blacklist: ['SILENT', 'QUIET']
            }
        },
        {
            code: 'PERFORMANCE',
            name: 'Performance Monitoring',
            description: 'Enables performance monitoring',
            environment: {
                whitelist: ['PROFILE', 'BENCHMARK'],
                blacklist: ['NO_PROFILING']
            }
        }
    ];

    setup(() => {
        sandbox = sinon.createSandbox();

        // Mock vscode.EventEmitter properly
        if (!vscode.EventEmitter) {
            (vscode as any).EventEmitter = function(this: any) {
                const self = this;
                self._listeners = [];
                self.event = function(listener: any) {
                    self._listeners.push(listener);
                    return { dispose: function() {} };
                };
                self.fire = function(data: any) {
                    self._listeners.forEach(function(listener: any) {
                        listener(data);
                    });
                };
                return self;
            };
        }

        // Mock vscode.TreeItemCheckboxState
        if (!vscode.TreeItemCheckboxState) {
            (vscode as any).TreeItemCheckboxState = {
                Checked: 1,
                Unchecked: 0
            };
        }

        // Mock vscode.TreeItemCollapsibleState
        if (!vscode.TreeItemCollapsibleState) {
            (vscode as any).TreeItemCollapsibleState = {
                None: 0,
                Collapsed: 1,
                Expanded: 2
            };
        }

        // Mock vscode.TreeItem
        if (!vscode.TreeItem) {
            (vscode as any).TreeItem = class {
                constructor(label: string, collapsibleState: any) {
                    (this as any).label = label;
                    (this as any).collapsibleState = collapsibleState;
                }
            };
        }

        // Mock vscode.ThemeIcon
        if (!vscode.ThemeIcon) {
            (vscode as any).ThemeIcon = class {
                constructor(id: string, color?: any) {
                    (this as any).id = id;
                    (this as any).color = color;
                }
            };
        }

        // Mock vscode.ThemeColor
        if (!vscode.ThemeColor) {
            (vscode as any).ThemeColor = class {
                constructor(id: string) {
                    (this as any).id = id;
                }
            };
        }

        // Mock extension context
        mockContext = {
            workspaceState: {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                keys: sandbox.stub().returns([])
            },
            subscriptions: [],
            extensionPath: '/test/path'
        } as any;

        // Mock FeatureStateManager
        mockFeatureStateManager = {
            isFeatureEnabled: sandbox.stub(),
            setFeatureEnabled: sandbox.stub().resolves(),
            toggleFeature: sandbox.stub().resolves(),
            getAllFeatureStates: sandbox.stub(),
            getForbiddenEnvironmentVariables: sandbox.stub()
        } as any;

        // Mock loadAppConfig
        loadAppConfigStub = sandbox.stub(appCommand, 'loadAppConfig').returns({
            commands: [],
            features: testFeatures
        });

        provider = new FeaturesTreeDataProvider(mockFeatureStateManager);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('FeatureTreeItem', () => {
        test('should create tree item for enabled feature', () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, true);

            assert.strictEqual(treeItem.label, 'Debug Mode');
            assert.strictEqual(treeItem.description, 'Enables debugging flags');
            assert.strictEqual(treeItem.checkboxState, vscode.TreeItemCheckboxState.Checked);
            assert.strictEqual(treeItem.contextValue, 'feature');
            assert.strictEqual(treeItem.isEnabled, true);
            assert.strictEqual(treeItem.feature, feature);
        });

        test('should create tree item for disabled feature', () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, false);

            assert.strictEqual(treeItem.label, 'Debug Mode');
            assert.strictEqual(treeItem.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
            assert.strictEqual(treeItem.isEnabled, false);
        });

        test('should create proper tooltip with feature details', () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, true);

            const expectedTooltip = `Debug Mode (Enabled)
Enables debugging flags

Environment Variables:
• Whitelist: DEBUG, VERBOSE
• Blacklist: SILENT, QUIET`;

            assert.strictEqual(treeItem.tooltip, expectedTooltip);
        });

        test('should handle feature with empty environment lists', () => {
            const feature: Feature = {
                code: 'EMPTY',
                name: 'Empty Feature',
                description: 'Feature with no env vars',
                environment: {
                    whitelist: [],
                    blacklist: []
                }
            };
            const treeItem = new FeatureTreeItem(feature, false);

            const expectedTooltip = `Empty Feature (Disabled)
Feature with no env vars

Environment Variables:
• Whitelist: None
• Blacklist: None`;

            assert.strictEqual(treeItem.tooltip, expectedTooltip);
        });
    });

    suite('FeaturesTreeDataProvider', () => {
        test('should refresh and load features from config', async () => {
            // Reset the stub since it was called in constructor
            loadAppConfigStub.resetHistory();
            
            await provider.refresh();

            assert.ok(loadAppConfigStub.calledOnce);
        });

        test('should return feature tree items for root level', async () => {
            (mockFeatureStateManager.isFeatureEnabled as sinon.SinonStub)
                .withArgs('DEBUG').returns(true)
                .withArgs('PERFORMANCE').returns(false);

            const children = await provider.getChildren();

            assert.strictEqual(children.length, 2);
            assert.ok(children[0] instanceof FeatureTreeItem);
            assert.ok(children[1] instanceof FeatureTreeItem);
            
            assert.strictEqual(children[0].feature.code, 'DEBUG');
            assert.strictEqual(children[0].isEnabled, true);
            assert.strictEqual(children[1].feature.code, 'PERFORMANCE');
            assert.strictEqual(children[1].isEnabled, false);
        });

        test('should return empty array for feature children', async () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, true);

            const children = await provider.getChildren(treeItem);

            assert.deepStrictEqual(children, []);
        });

        test('should return tree item representation', () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, true);

            const result = provider.getTreeItem(treeItem);

            assert.strictEqual(result, treeItem);
        });

        test('should handle checkbox state change to enabled', async () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, false);

            await provider.onDidChangeCheckboxState(treeItem, vscode.TreeItemCheckboxState.Checked);

            assert.ok((mockFeatureStateManager.setFeatureEnabled as sinon.SinonStub).calledOnce);
            assert.ok((mockFeatureStateManager.setFeatureEnabled as sinon.SinonStub).calledWith('DEBUG', true));
        });

        test('should handle checkbox state change to disabled', async () => {
            const feature = testFeatures[0];
            const treeItem = new FeatureTreeItem(feature, true);

            await provider.onDidChangeCheckboxState(treeItem, vscode.TreeItemCheckboxState.Unchecked);

            assert.ok((mockFeatureStateManager.setFeatureEnabled as sinon.SinonStub).calledOnce);
            assert.ok((mockFeatureStateManager.setFeatureEnabled as sinon.SinonStub).calledWith('DEBUG', false));
        });

        test('should return feature state manager', () => {
            const result = provider.getFeatureStateManager();
            assert.strictEqual(result, mockFeatureStateManager);
        });

        test('should handle empty features list', async () => {
            loadAppConfigStub.returns({ commands: [], features: [] });

            await provider.refresh();
            const children = await provider.getChildren();

            assert.deepStrictEqual(children, []);
        });

        test('should handle undefined features in config', async () => {
            loadAppConfigStub.returns({ commands: [] }); // No features property

            await provider.refresh();
            const children = await provider.getChildren();

            assert.deepStrictEqual(children, []);
        });
    });

    suite('Tree Data Provider Events', () => {
        test('should fire tree data change event on refresh', async () => {
            let eventFired = false;
            provider.onDidChangeTreeData(() => {
                eventFired = true;
            });

            await provider.refresh();

            assert.ok(eventFired);
        });
    });
});
