// Enable source map support for better stack traces
import 'source-map-support/register';

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { ProcessTracker } from '../processTracker';
import { AppCommandTreeItem } from '../appRunner';
import type { Command, ProcessState } from '../types';
import * as utils from '../utils';
import { ProcessHelper } from './helpers/processHelpers';
import { FsHelperMock } from './helpers/fsHelperMock';

suite('AppRunner', () => {
    let sandbox: sinon.SinonSandbox;
    let mockWorkspaceFolder: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        // Reset the mock filesystem
        FsHelperMock.reset();
        FsHelperMock.mock(sandbox);
        // Mock process.kill to avoid killing actual processes
        sandbox.stub(process, 'kill').returns(true as any);

        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');

        // Mock vscode workspace
        mockWorkspaceFolder = {
            uri: { fsPath: '/test/workspace' }
        };
        
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspaceFolder]);
        
        // Ensure vscode.Uri exists and mock parse
        if (!vscode.Uri) {
            (vscode as any).Uri = {};
        }
        if (!vscode.Uri.parse) {
            (vscode.Uri.parse as any) = () => ({});
        }
        sandbox.stub(vscode.Uri, 'parse').callsFake((value: string) => ({
            scheme: 'crashed-command',
            path: value,
            fsPath: value,
            toString: () => value
        } as any));
        
        // Mock vscode.EventEmitter
        if (!vscode.EventEmitter) {
            (vscode as any).EventEmitter = class MockEventEmitter<T> {
                private listeners: Array<(e: T) => void> = [];
                
                constructor() {}
                
                get event() {
                    return (listener: (e: T) => void) => {
                        this.listeners.push(listener);
                        return { dispose: () => {} };
                    };
                }
                
                fire(data: T): void {
                    this.listeners.forEach(listener => listener(data));
                }
                
                dispose(): void {
                    this.listeners = [];
                }
            };
        }
    });

    teardown(() => {
        FsHelperMock.reset();
        sandbox.restore();
    });

    suite('AppCommandTreeItem contextValue', () => {
        const testCommand: Command = {
            code: 'TEST_CMD',
            description: 'Test Command',
            command: 'echo "test"',
            commandType: 'shell'
        };

        test('should include canRun when process not running and not crashed', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: false,
            isLocked: false           
           };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canRun');
        });

        test('should include canShowOutputCrashed when process not running and crashed', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputCrashed,canShowOutput');
        });

        test('should include canShowOutputRunning when process is running', () => {
            const state: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canShowOutput');
        });

        test('should include canShowOutputRunning and canDebug for ruby commands when running but not debugging', () => {
            const rubyCommand: Command = {
                ...testCommand,
                commandType: 'ruby'
            };
            const state: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(rubyCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canDebug,canShowOutput');
        });

        test('should not include canShowOutputCrashed when crashed but no output channel', () => {
            const state: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'crashed',
                hasOutputChannel: false,
            isLocked: false            };

            const item = new AppCommandTreeItem(testCommand, state);
            assert.strictEqual(item.contextValue, '');
        });

        test('should include canShowOutputRunning when debugging is active', () => {
            const rubyCommand: Command = {
                ...testCommand,
                commandType: 'ruby'
            };
            const state: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: true,
            isLocked: false            };

            const item = new AppCommandTreeItem(rubyCommand, state);
            assert.strictEqual(item.contextValue, 'canShowOutputRunning,canStop,canShowOutput');
        });
    });

    suite('ProcessTracker output channel methods', () => {
        let mockOutputChannel: any;
        setup(() => {
            // Create a mock output channel first
            mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sinon.stub(),
                // Add LogOutputChannel methods
                trace: sinon.stub(),
                debug: sinon.stub(),
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub(),
                logLevel: 1 // vscode.LogLevel.Info
            };
            sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);
        });

        test('should return true when output channel exists', async () => {
            // Spawn a process to create the output channel
            await ProcessHelper.spawnAndTrackSuccess('TEST_HAS_OUTPUT', [], sandbox);

            assert.strictEqual(ProcessTracker.hasOutputChannel('TEST_HAS_OUTPUT'), true);
            
            // Clean up
            ProcessTracker.disposeOutputChannel('TEST_HAS_OUTPUT');
        });

        test('should return false when output channel does not exist', () => {
            assert.strictEqual(ProcessTracker.hasOutputChannel('NONEXISTENT'), false);
        });

        test('should return output channel when it exists', async () => {
            // Spawn a process to create the output channel
            await ProcessHelper.spawnAndTrackSuccess('TEST_GET_OUTPUT', [], sandbox);

            // First spawn should not call clear (new output channel)
            assert.strictEqual(mockOutputChannel.clear.callCount, 0);

            // Spawn again with the same code to test reusing existing output channel
            await ProcessHelper.spawnAndTrackSuccess('TEST_GET_OUTPUT', [], sandbox);

            // Second spawn should call clear (reusing existing output channel)
            assert.strictEqual(mockOutputChannel.clear.callCount, 1);

            const outputChannel = ProcessTracker.getOutputChannel('TEST_GET_OUTPUT');
            assert.ok(outputChannel);
            assert.strictEqual(outputChannel, mockOutputChannel);
            
            // Clean up
            ProcessTracker.disposeOutputChannel('TEST_GET_OUTPUT');
        });

        test('should return undefined when output channel does not exist', () => {
            const outputChannel = ProcessTracker.getOutputChannel('NONEXISTENT');
            assert.strictEqual(outputChannel, undefined);
        });
    });

    suite('runAndDebugCommand', () => {
        test('should reject shell commands', async () => {
            const shellCommand: Command = {
                code: 'TEST_SHELL',
                description: 'Test Shell Command',
                command: 'echo "test"',
                commandType: 'shell'
            };

            const { runAndDebugCommand } = await import('../appCommand');
            
            try {
                await runAndDebugCommand(shellCommand);
                assert.fail('Expected runAndDebugCommand to throw for shell commands');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('Run & Debug is only supported for Ruby commands'));
            }
        });
    });

    suite('AppRunnerTreeDataProvider refresh command', () => {
        test('should load default commands when app_commands.jsonc file does not exist', async () => {
            // Import after setting up mocks
            const { AppRunnerTreeDataProvider } = await import('../appRunner');
            const { getDefaultAppConfig } = await import('../appCommand');
            
            const provider = new AppRunnerTreeDataProvider();
            
            // Call refresh method
            await provider.refresh();
            
            // Get the commands from the provider
            const children = await provider.getChildren();
            const defaultConfig = getDefaultAppConfig();
            
            // Should have loaded default commands
            assert.strictEqual(children.length, defaultConfig.commands.length);
            assert.strictEqual(children[0].cmd.code, defaultConfig.commands[0].code);
            assert.strictEqual(children[0].cmd.description, defaultConfig.commands[0].description);
            
            if (children.length > 1) {
                assert.strictEqual(children[1].cmd.code, defaultConfig.commands[1].code);
                assert.strictEqual(children[1].cmd.description, defaultConfig.commands[1].description);
            }
        });

        test('should load custom commands when app_commands.jsonc file exists', async () => {
            const customConfig = {
                commands: [
                    {
                        code: 'CUSTOM_CMD',
                        description: 'Custom Test Command',
                        command: 'echo "custom"',
                        commandType: 'shell' as const
                    }
                ]
            };

            FsHelperMock.writeFileSync('/test/workspace/.vscode/app_commands.jsonc', JSON.stringify(customConfig));
            
            // Import after setting up mocks
            const { AppRunnerTreeDataProvider } = await import('../appRunner');
            
            const provider = new AppRunnerTreeDataProvider();
            
            // Call refresh method
            await provider.refresh();
            
            // Get the commands from the provider
            const children = await provider.getChildren();
            
            // Should have loaded custom commands
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].cmd.code, 'CUSTOM_CMD');
            assert.strictEqual(children[0].cmd.description, 'Custom Test Command');
        });
    });

    suite('Debug State UI Tests', () => {
        test('should hide debug option when debugActive is true', () => {
            const testCommand: Command = {
                description: 'Test Server',
                command: 'rails server',
                code: 'server',
                commandType: 'ruby',
            };

            const debugActiveState: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: true,
                isLocked: false,
                workspaceHash: 'mock-hash-1234'
            };

            const treeItem = new AppCommandTreeItem(testCommand, debugActiveState);
            const contextValue = treeItem.contextValue || '';
            
            // Should not have debug capability when already debugging
            assert.ok(!contextValue.includes('canDebug'), 'Should not have debug capability when debugActive is true');
            
            // Should still have other capabilities
            assert.ok(contextValue.includes('canStop'), 'Should still have stop capability');
            assert.ok(contextValue.includes('canShowOutputRunning'), 'Should still have output capability');
        });

        test('should show debug option when debugActive is false for running ruby commands', () => {
            const testCommand: Command = {
                description: 'Test Server',
                command: 'rails server',
                code: 'server',
                commandType: 'ruby',
            };

            const notDebuggingState: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
                isLocked: false,
                workspaceHash: 'mock-hash-1234'
            };

            const treeItem = new AppCommandTreeItem(testCommand, notDebuggingState);
            const contextValue = treeItem.contextValue || '';
            
            // Should have debug capability when not debugging
            assert.ok(contextValue.includes('canDebug'), 'Should have debug capability when debugActive is false');
            
            // Should also have other capabilities
            assert.ok(contextValue.includes('canStop'), 'Should have stop capability');
            assert.ok(contextValue.includes('canShowOutputRunning'), 'Should have output capability');
        });

        test('should never show debug option for shell commands regardless of debug state', () => {
            const testCommand: Command = {
                description: 'Test Shell',
                command: 'echo "test"',
                code: 'shell',
                commandType: 'shell',
            };

            const notDebuggingState: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
                isLocked: false,
                workspaceHash: 'mock-hash-1234'
            };

            const treeItem = new AppCommandTreeItem(testCommand, notDebuggingState);
            const contextValue = treeItem.contextValue || '';
            
            // Should never have debug capability for shell commands
            assert.ok(!contextValue.includes('canDebug'), 'Should never have debug capability for shell commands');
            
            // Should still have other capabilities
            assert.ok(contextValue.includes('canStop'), 'Should have stop capability');
            assert.ok(contextValue.includes('canShowOutputRunning'), 'Should have output capability');
        });

        test('should show debug option when not running (for run & debug)', () => {
            const testCommand: Command = {
                description: 'Test Server',
                command: 'rails server',
                code: 'server',
                commandType: 'ruby',
            };

            const notRunningState: ProcessState = {
                exists: false,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: false,
                isLocked: false,
                workspaceHash: undefined
            };

            const treeItem = new AppCommandTreeItem(testCommand, notRunningState);
            const contextValue = treeItem.contextValue || '';
            
            // Should have run capability when not running
            assert.ok(contextValue.includes('canRun'), 'Should have run capability when not running');
            
            // Should not have debug capability when not running (only run & debug)
            assert.ok(!contextValue.includes('canDebug'), 'Should not have debug capability when not running');
        });

        test('should handle debug state changes in contextValue correctly', () => {
            const testCommand: Command = {
                description: 'Test Server',
                command: 'rails server',
                code: 'server',
                commandType: 'ruby',
            };

            // Test transition from not debugging to debugging
            const notDebuggingState: ProcessState = {
                exists: true,
                debugActive: false,
                terminationReason: 'none',
                hasOutputChannel: true,
                isLocked: false,
                workspaceHash: 'mock-hash-1234'
            };

            const debuggingState: ProcessState = {
                exists: true,
                debugActive: true,
                terminationReason: 'none',
                hasOutputChannel: true,
                isLocked: false,
                workspaceHash: 'mock-hash-1234'
            };

            // Not debugging - should have debug capability
            const treeItemNotDebugging = new AppCommandTreeItem(testCommand, notDebuggingState);
            const contextValueNotDebugging = treeItemNotDebugging.contextValue || '';
            assert.ok(contextValueNotDebugging.includes('canDebug'), 'Should have debug capability when not debugging');

            // Debugging - should not have debug capability
            const treeItemDebugging = new AppCommandTreeItem(testCommand, debuggingState);
            const contextValueDebugging = treeItemDebugging.contextValue || '';
            assert.ok(!contextValueDebugging.includes('canDebug'), 'Should not have debug capability when debugging');
        });
    });
});
