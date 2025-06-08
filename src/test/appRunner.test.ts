import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { ProcessTracker } from '../processTracker';
import { AppCommandTreeItem } from '../appRunner';
import type { Command, ProcessState } from '../types';
import * as utils from '../utils';

suite('AppRunner', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
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
            isLocked: false            };

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
        test('should return true when output channel exists', () => {
            // Create a mock output channel first
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sinon.stub(),
            };
            sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);

            // Mock filesystem to simulate PID file creation
            const mockFiles = new Map();
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'writeFileSync').callsFake((path: any, data: any) => {
                mockFiles.set(String(path), String(data));
            });
            sandbox.stub(fs, 'readFileSync').callsFake((path: any) => {
                return mockFiles.get(String(path)) || '12345';
            });
            sandbox.stub(fs, 'unlinkSync').callsFake((path: any) => {
                mockFiles.delete(String(path));
            });
            sandbox.stub(fs, 'mkdirSync').returns(undefined);

            // Mock child_process.spawn to avoid actual process spawning
            const mockChild = new EventEmitter() as any;
            mockChild.pid = 12345;
            mockChild.stdout = new EventEmitter();
            mockChild.stderr = new EventEmitter();
            mockChild.kill = sandbox.stub().returns(true);
            sandbox.stub(childProcess, 'spawn').returns(mockChild);

            // Mock process.kill to avoid killing actual processes
            sandbox.stub(process, 'kill').returns(true as any);

            // Spawn a process to create the output channel
            ProcessTracker.spawnAndTrack({
                code: 'TEST_HAS_OUTPUT',
                command: 'echo "test"',
                args: []
            });

            assert.strictEqual(ProcessTracker.hasOutputChannel('TEST_HAS_OUTPUT'), true);
            
            // Clean up
            ProcessTracker.disposeOutputChannel('TEST_HAS_OUTPUT');
        });

        test('should return false when output channel does not exist', () => {
            assert.strictEqual(ProcessTracker.hasOutputChannel('NONEXISTENT'), false);
        });

        test('should return output channel when it exists', () => {
            // Create a mock output channel first
            const mockOutputChannel = {
                show: sandbox.stub(),
                append: sandbox.stub(),
                appendLine: sandbox.stub(),
                dispose: sandbox.stub(),
                clear: sandbox.stub(),
            };
            sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);

            // Mock filesystem to simulate PID file creation
            const mockFiles = new Map();
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'writeFileSync').callsFake((path: any, data: any) => {
                mockFiles.set(String(path), String(data));
            });
            sandbox.stub(fs, 'readFileSync').callsFake((path: any) => {
                return mockFiles.get(String(path)) || '12345';
            });
            sandbox.stub(fs, 'unlinkSync').callsFake((path: any) => {
                mockFiles.delete(String(path));
            });
            sandbox.stub(fs, 'mkdirSync').returns(undefined);

            // Mock child_process.spawn to avoid actual process spawning
            const mockChild = new EventEmitter() as any;
            mockChild.pid = 12345;
            mockChild.stdout = new EventEmitter();
            mockChild.stderr = new EventEmitter();
            mockChild.kill = sandbox.stub().returns(true);
            sandbox.stub(childProcess, 'spawn').returns(mockChild);

            // Mock process.kill to avoid killing actual processes
            sandbox.stub(process, 'kill').returns(true as any);

            // Spawn a process to create the output channel
            ProcessTracker.spawnAndTrack({
                code: 'TEST_GET_OUTPUT',
                command: 'echo "test"',
                args: []
            });

            // First spawn should not call clear (new output channel)
            assert.strictEqual(mockOutputChannel.clear.callCount, 0);

            // Spawn again with the same code to test reusing existing output channel
            ProcessTracker.spawnAndTrack({
                code: 'TEST_GET_OUTPUT',
                command: 'echo "test2"',
                args: []
            });

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
            // Mock filesystem to simulate file not existing and handle PID file operations
            const mockFiles = new Map();
            sandbox.stub(fs, 'existsSync').callsFake((path: any) => {
                const pathStr = String(path);
                if (pathStr.includes('app_commands.jsonc')) {
                    return false; // Simulate app_commands.jsonc doesn't exist
                }
                return mockFiles.has(pathStr);
            });
            sandbox.stub(fs, 'readFileSync').callsFake((path: any) => {
                return mockFiles.get(String(path)) || '';
            });
            sandbox.stub(fs, 'writeFileSync').callsFake((path: any, data: any) => {
                mockFiles.set(String(path), String(data));
            });
            sandbox.stub(fs, 'unlinkSync').callsFake((path: any) => {
                mockFiles.delete(String(path));
            });
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            
            // Mock process.kill to avoid killing actual processes
            sandbox.stub(process, 'kill').returns(true as any);
            
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
            
            // Mock filesystem to simulate file existing with custom content and handle PID file operations
            const mockFiles = new Map();
            sandbox.stub(fs, 'existsSync').callsFake((path: any) => {
                const pathStr = String(path);
                if (pathStr.includes('app_commands.jsonc')) {
                    return true; // Simulate app_commands.jsonc exists
                }
                return mockFiles.has(pathStr);
            });
            sandbox.stub(fs, 'readFileSync').callsFake((path: any) => {
                const pathStr = String(path);
                if (pathStr.includes('app_commands.jsonc')) {
                    return JSON.stringify(customConfig);
                }
                return mockFiles.get(pathStr) || '';
            });
            sandbox.stub(fs, 'writeFileSync').callsFake((path: any, data: any) => {
                mockFiles.set(String(path), String(data));
            });
            sandbox.stub(fs, 'unlinkSync').callsFake((path: any) => {
                mockFiles.delete(String(path));
            });
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            
            // Mock process.kill to avoid killing actual processes
            sandbox.stub(process, 'kill').returns(true as any);
            
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
});
