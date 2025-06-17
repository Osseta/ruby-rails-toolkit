import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../extension';
import * as rspecRunner from '../rspecRunner';
import * as appRunner from '../appRunner';
import { ProcessTracker } from '../processTracker';
import { ExtensionVscodeWrapper } from '../extensionVscodeWrapper';

suite('Extension Activation Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let mockConfig: sinon.SinonStubbedInstance<vscode.WorkspaceConfiguration>;
    let mockVscodeWrapper: sinon.SinonStubbedInstance<ExtensionVscodeWrapper>;
    let activateRspecRunnerStub: sinon.SinonStub;
    let registerAppRunnerTreeViewStub: sinon.SinonStub;
    let processTrackerInitializeStub: sinon.SinonStub;
    let loggerStub: sinon.SinonStubbedInstance<any>;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock vscode.EventEmitter for features tree view
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

        // Mock other VS Code components for tree views
        if (!vscode.TreeItemCheckboxState) {
            (vscode as any).TreeItemCheckboxState = { Checked: 1, Unchecked: 0 };
        }
        if (!vscode.TreeItemCollapsibleState) {
            (vscode as any).TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
        }
        if (!vscode.TreeItem) {
            (vscode as any).TreeItem = class {
                constructor(label: string, collapsibleState: any) {
                    (this as any).label = label;
                    (this as any).collapsibleState = collapsibleState;
                }
            };
        }
        if (!vscode.ThemeIcon) {
            (vscode as any).ThemeIcon = class {
                constructor(id: string, color?: any) {
                    (this as any).id = id;
                    (this as any).color = color;
                }
            };
        }
        if (!vscode.ThemeColor) {
            (vscode as any).ThemeColor = class {
                constructor(id: string) {
                    (this as any).id = id;
                }
            };
        }
        
        // Mock VS Code workspace configuration
        mockConfig = {
            get: sandbox.stub(),
            has: sandbox.stub(),
            inspect: sandbox.stub(),
            update: sandbox.stub()
        } as any;
        
        // Create a separate config for the editor configuration
        const editorConfig = {
            get: sandbox.stub(),
            has: sandbox.stub(),
            inspect: sandbox.stub(),
            update: sandbox.stub()
        } as any;
        
        // Mock the VS Code wrapper
        mockVscodeWrapper = {
            getConfiguration: sandbox.stub(),
            onDidChangeConfiguration: sandbox.stub(),
            showInformationMessage: sandbox.stub(),
            executeCommand: sandbox.stub(),
            ConfigurationTarget: {
                Global: 1,
                Workspace: 2,
                WorkspaceFolder: 3
            }
        } as any;
        
        // Set up wrapper stubs
        mockVscodeWrapper.getConfiguration.withArgs('rubyToolkit').returns(mockConfig);
        mockVscodeWrapper.getConfiguration.withArgs('', sinon.match.any).returns(editorConfig);
        mockVscodeWrapper.onDidChangeConfiguration.returns({
            dispose: sandbox.stub()
        } as any);
        mockVscodeWrapper.showInformationMessage.resolves('Reload Window' as any);
        mockVscodeWrapper.executeCommand.resolves();
        
        // Mock vscode.window for tree view creation
        if (!vscode.window.createTreeView) {
            (vscode.window as any).createTreeView = sandbox.stub().returns({
                onDidChangeCheckboxState: sandbox.stub().returns({ dispose: sandbox.stub() }),
                dispose: sandbox.stub()
            });
        }
        
        // Mock vscode.commands for command registration
        if (!vscode.commands.registerCommand) {
            (vscode.commands as any).registerCommand = sandbox.stub().returns({ dispose: sandbox.stub() });
        }
        
        // Set up default configuration values
        mockConfig.get.withArgs('hideAnsiPunctuation', true).returns(true);
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(true);
        
        // Mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/path',
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub()
            },
            workspaceState: {
                get: sandbox.stub().callsFake((key: string, defaultValue?: any) => {
                    if (key === 'ruby-rails-toolkit.featureStates') {
                        return {};
                    }
                    return defaultValue;
                }),
                update: sandbox.stub().resolves()
            }
        } as any;
        
        // Mock dependencies
        activateRspecRunnerStub = sandbox.stub(rspecRunner, 'activate');
        registerAppRunnerTreeViewStub = sandbox.stub(appRunner, 'registerAppRunnerTreeView');
        processTrackerInitializeStub = sandbox.stub(ProcessTracker, 'initialize');
        
        // Mock logger
        loggerStub = {
            info: sandbox.stub(),
            debug: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub()
        };
        sandbox.stub(require('../logger'), 'getLogger').returns(loggerStub);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should activate RSpec runner when disableRspecIntegration is false', () => {
        // Arrange
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(false);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Assert
        sinon.assert.calledOnce(activateRspecRunnerStub);
        sinon.assert.calledWith(activateRspecRunnerStub, mockContext);
        sinon.assert.calledWith(loggerStub.debug, 'RSpec Runner activated');
    });

    test('should not activate RSpec runner when disableRspecIntegration is true', () => {
        // Arrange
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(true);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Assert
        sinon.assert.notCalled(activateRspecRunnerStub);
        sinon.assert.calledWith(loggerStub.debug, 'RSpec integration disabled by configuration');
    });

    test('should always activate other components regardless of RSpec setting', () => {
        // Arrange
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(true);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Assert
        sinon.assert.calledOnce(processTrackerInitializeStub);
        sinon.assert.calledWith(processTrackerInitializeStub, mockContext);
        sinon.assert.calledOnce(registerAppRunnerTreeViewStub);
        sinon.assert.calledWith(registerAppRunnerTreeViewStub, mockContext);
        sinon.assert.calledWith(loggerStub.debug, 'ProcessTracker initialized');
        sinon.assert.calledWith(loggerStub.debug, 'App Runner TreeView registered');
        sinon.assert.calledWith(loggerStub.info, 'Ruby & Rails Toolkit extension activated successfully');
    });

    test('should handle configuration changes for disableRspecIntegration', async () => {
        // Arrange
        let configWatcherCallback: (event: vscode.ConfigurationChangeEvent) => void;
        mockVscodeWrapper.onDidChangeConfiguration.callsFake((callback) => {
            configWatcherCallback = callback;
            return { dispose: sandbox.stub() } as any;
        });
        
        const mockEvent = {
            affectsConfiguration: sandbox.stub()
        } as any;
        
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(false);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Simulate configuration change for RSpec integration
        mockEvent.affectsConfiguration.withArgs('rubyToolkit.disableRspecIntegration').returns(true);
        mockEvent.affectsConfiguration.withArgs('rubyToolkit.hideAnsiPunctuation').returns(false);
        
        configWatcherCallback!(mockEvent);
        
        // Wait for promise to resolve
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Assert
        sinon.assert.calledOnce(mockVscodeWrapper.showInformationMessage);
        sinon.assert.calledWith(mockVscodeWrapper.executeCommand, 'workbench.action.reloadWindow');
    });

    test('should not show reload message when RSpec config does not change', () => {
        // Arrange
        let configWatcherCallback: (event: vscode.ConfigurationChangeEvent) => void;
        mockVscodeWrapper.onDidChangeConfiguration.callsFake((callback) => {
            configWatcherCallback = callback;
            return { dispose: sandbox.stub() } as any;
        });
        
        const mockEvent = {
            affectsConfiguration: sandbox.stub()
        } as any;
        
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(false);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Simulate configuration change for different setting
        mockEvent.affectsConfiguration.withArgs('rubyToolkit.disableRspecIntegration').returns(false);
        mockEvent.affectsConfiguration.withArgs('rubyToolkit.hideAnsiPunctuation').returns(true);
        
        configWatcherCallback!(mockEvent);
        
        // Assert
        sinon.assert.notCalled(mockVscodeWrapper.showInformationMessage);
    });

    test('should read configuration with correct key and default value', () => {
        // Arrange
        mockConfig.get.withArgs('disableRspecIntegration', true).returns(false);
        
        // Act
        activate(mockContext, mockVscodeWrapper);
        
        // Assert
        sinon.assert.calledWith(mockConfig.get, 'disableRspecIntegration', true);
    });
});
