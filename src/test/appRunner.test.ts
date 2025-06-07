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
});
