import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../extension';
import * as rspecRunner from '../rspecRunner';
import * as appRunner from '../appRunner';
import { ProcessTracker } from '../processTracker';
import { getLogger } from '../logger';
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
                get: sandbox.stub(),
                update: sandbox.stub()
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
