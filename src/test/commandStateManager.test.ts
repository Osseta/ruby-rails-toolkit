import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CommandStateManager } from '../commandStateManager';
import { ProcessTracker } from '../processTracker';
import type { Command } from '../types';
import * as utils from '../utils';

suite('CommandStateManager Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockCommands: Command[];
    let onUpdateCallback: sinon.SinonSpy;
    let manager: CommandStateManager;
    let isRunningStub: sinon.SinonStub;
    let getTerminationReasonStub: sinon.SinonStub;
    let hasOutputChannelStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
        // Mock commands for testing
        mockCommands = [
            {
                code: 'TEST_CMD_1',
                description: 'Test Command 1',
                command: 'rails server',
                commandType: 'ruby'
            },
            {
                code: 'TEST_CMD_2',
                description: 'Test Command 2',
                command: 'echo "test"',
                commandType: 'shell'
            }
        ];
        
        // Create spy for onUpdate callback
        onUpdateCallback = sandbox.spy();
        
        // Mock ProcessTracker methods - store references to avoid double-stubbing
        isRunningStub = sandbox.stub(ProcessTracker, 'isRunning').returns(false);
        getTerminationReasonStub = sandbox.stub(ProcessTracker, 'getTerminationReason').returns('none');
        hasOutputChannelStub = sandbox.stub(ProcessTracker, 'hasOutputChannel').returns(false);
    });

    teardown(() => {
        if (manager) {
            manager.dispose();
        }
        sandbox.restore();
    });

    test('should change crashed termination reason to none when no output channel exists', async () => {
        // Setup: Configure stubs to return crashed termination but no output channel
        isRunningStub.withArgs('TEST_CMD_1').returns(false);
        getTerminationReasonStub.withArgs('TEST_CMD_1').returns('crashed');
        hasOutputChannelStub.withArgs('TEST_CMD_1').returns(false); // No output channel
        
        isRunningStub.withArgs('TEST_CMD_2').returns(false);
        getTerminationReasonStub.withArgs('TEST_CMD_2').returns('none');
        hasOutputChannelStub.withArgs('TEST_CMD_2').returns(false);
        
        // Act: Create CommandStateManager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        
        // Wait a bit for initial polling to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Assert: Verify that the crashed termination reason was changed to none
        const state1 = manager.getButtonState('TEST_CMD_1');
        assert.strictEqual(state1.terminationReason, 'none', 
            'Crashed termination reason should be changed to none when no output channel exists');
        assert.strictEqual(state1.hasOutputChannel, false);
        assert.strictEqual(state1.exists, false);
        
        // Verify that normal commands are unaffected
        const state2 = manager.getButtonState('TEST_CMD_2');
        assert.strictEqual(state2.terminationReason, 'none');
        assert.strictEqual(state2.hasOutputChannel, false);
        assert.strictEqual(state2.exists, false);
    });

    test('should preserve crashed termination reason when output channel exists', async () => {
        // Setup: Configure stubs to return crashed termination WITH output channel
        isRunningStub.withArgs('TEST_CMD_1').returns(false);
        getTerminationReasonStub.withArgs('TEST_CMD_1').returns('crashed');
        hasOutputChannelStub.withArgs('TEST_CMD_1').returns(true); // Has output channel
        
        // Act: Create CommandStateManager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        
        // Wait a bit for initial polling to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Assert: Verify that the crashed termination reason is preserved when output channel exists
        const state1 = manager.getButtonState('TEST_CMD_1');
        assert.strictEqual(state1.terminationReason, 'crashed', 
            'Crashed termination reason should be preserved when output channel exists');
        assert.strictEqual(state1.hasOutputChannel, true);
        assert.strictEqual(state1.exists, false);
    });

    test('should not affect user-requested termination reason', async () => {
        // Setup: Configure stubs to return user-requested termination without output channel
        isRunningStub.withArgs('TEST_CMD_1').returns(false);
        getTerminationReasonStub.withArgs('TEST_CMD_1').returns('user-requested');
        hasOutputChannelStub.withArgs('TEST_CMD_1').returns(false); // No output channel
        
        // Act: Create CommandStateManager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        
        // Wait a bit for initial polling to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Assert: Verify that user-requested termination reason is not affected
        const state1 = manager.getButtonState('TEST_CMD_1');
        assert.strictEqual(state1.terminationReason, 'user-requested', 
            'User-requested termination reason should not be changed');
        assert.strictEqual(state1.hasOutputChannel, false);
        assert.strictEqual(state1.exists, false);
    });

    test('should update state correctly during polling', async () => {
        // Setup: Configure stubs to simulate crashed state without output channel
        isRunningStub.withArgs('TEST_CMD_1').returns(false);
        getTerminationReasonStub.withArgs('TEST_CMD_1').returns('crashed');
        hasOutputChannelStub.withArgs('TEST_CMD_1').returns(false);
        
        // Act: Create CommandStateManager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        
        // Wait for initial polling to complete
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Assert: Verify that the crashed state was converted to none during polling
        const state1 = manager.getButtonState('TEST_CMD_1');
        assert.strictEqual(state1.terminationReason, 'none', 
            'Crashed termination reason should be changed to none during polling');
        assert.strictEqual(state1.hasOutputChannel, false);
        assert.strictEqual(state1.exists, false);
    });

    test('should call onUpdate callback during state changes', async () => {
        // Setup: Use existing stubs
        isRunningStub.returns(false);
        getTerminationReasonStub.returns('none');
        hasOutputChannelStub.returns(false);
        
        // Act: Create CommandStateManager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        
        // Wait for initial polling
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Assert: Verify that onUpdate was called
        assert.ok(onUpdateCallback.called, 'onUpdate callback should be called during initialization');
    });

    test('should return default state for unknown command codes', () => {
        // Act: Create CommandStateManager with empty commands
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, []);
        
        // Assert: Verify default state is returned for unknown code
        const state = manager.getButtonState('UNKNOWN_CODE');
        assert.strictEqual(state.exists, false);
        assert.strictEqual(state.debugActive, false);
        assert.strictEqual(state.terminationReason, 'none');
        assert.strictEqual(state.hasOutputChannel, false);
        assert.strictEqual(state.isLocked, false);
    });

    test('should dispose properly and stop polling', () => {
        // Setup: Spy on clearInterval to verify it's called
        const clearIntervalSpy = sandbox.spy(global, 'clearInterval');
        
        // Act: Create and dispose manager
        manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
        manager.dispose();
        
        // Assert: Verify clearInterval was called
        assert.ok(clearIntervalSpy.called, 'clearInterval should be called during dispose');
    });

    suite('Debug Session Tracking Tests', () => {
        test('should register debug session and update debugActive state', async () => {
            // Setup: Create manager
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            
            // Create mock debug session
            const mockSession = {
                id: 'test-session-1',
                type: 'rdbg',
                name: 'Attach to rdbg (TEST_CMD_1)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (TEST_CMD_1)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            // Act: Register debug session
            manager.registerDebugSession('TEST_CMD_1', mockSession);
            
            // Wait for polling to update
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify debugActive state is true
            const state = manager.getButtonState('TEST_CMD_1');
            assert.strictEqual(state.debugActive, true, 'debugActive should be true after registering session');
            
            // Verify the session can be retrieved
            const retrievedSession = manager.getDebugSession('TEST_CMD_1');
            assert.strictEqual(retrievedSession?.id, 'test-session-1');
        });

        test('should unregister debug session and update debugActive state', async () => {
            // Setup: Create manager and register session
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            
            const mockSession = {
                id: 'test-session-2',
                type: 'rdbg',
                name: 'Attach to rdbg (TEST_CMD_1)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (TEST_CMD_1)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            manager.registerDebugSession('TEST_CMD_1', mockSession);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Verify session is active
            let state = manager.getButtonState('TEST_CMD_1');
            assert.strictEqual(state.debugActive, true);
            
            // Act: Unregister debug session
            manager.unregisterDebugSession(mockSession);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify debugActive state is false
            state = manager.getButtonState('TEST_CMD_1');
            assert.strictEqual(state.debugActive, false, 'debugActive should be false after unregistering session');
            
            // Verify the session is no longer retrievable
            const retrievedSession = manager.getDebugSession('TEST_CMD_1');
            assert.strictEqual(retrievedSession, undefined);
        });

        test('should only consider rdbg sessions as active debug sessions', async () => {
            // Setup: Create manager
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            
            // Create mock non-rdbg session
            const mockNonRdbgSession = {
                id: 'test-session-3',
                type: 'node',
                name: 'Node Debug Session',
                workspaceFolder: undefined,
                configuration: {
                    type: 'node',
                    name: 'Node Debug Session',
                    request: 'launch'
                }
            } as vscode.DebugSession;
            
            // Act: Register non-rdbg session
            manager.registerDebugSession('TEST_CMD_1', mockNonRdbgSession);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify debugActive state remains false for non-rdbg sessions
            const state = manager.getButtonState('TEST_CMD_1');
            assert.strictEqual(state.debugActive, false, 'debugActive should be false for non-rdbg sessions');
        });

        test('should only consider sessions with matching command names as active', async () => {
            // Setup: Create manager
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            
            // Create mock rdbg session with wrong command name
            const mockWrongNameSession = {
                id: 'test-session-4',
                type: 'rdbg',
                name: 'Attach to rdbg (DIFFERENT_CMD)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (DIFFERENT_CMD)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            // Act: Register session with wrong name
            manager.registerDebugSession('TEST_CMD_1', mockWrongNameSession);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify debugActive state remains false for mismatched names
            const state = manager.getButtonState('TEST_CMD_1');
            assert.strictEqual(state.debugActive, false, 'debugActive should be false for sessions with mismatched command names');
        });

        test('should handle multiple debug sessions for different commands', async () => {
            // Setup: Create manager
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            
            // Create mock debug sessions for different commands
            const mockSession1 = {
                id: 'test-session-5',
                type: 'rdbg',
                name: 'Attach to rdbg (TEST_CMD_1)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (TEST_CMD_1)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            const mockSession2 = {
                id: 'test-session-6',
                type: 'rdbg',
                name: 'Attach to rdbg (TEST_CMD_2)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (TEST_CMD_2)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            // Act: Register both sessions
            manager.registerDebugSession('TEST_CMD_1', mockSession1);
            manager.registerDebugSession('TEST_CMD_2', mockSession2);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify both commands have debugActive = true
            const state1 = manager.getButtonState('TEST_CMD_1');
            const state2 = manager.getButtonState('TEST_CMD_2');
            
            assert.strictEqual(state1.debugActive, true, 'TEST_CMD_1 should have debugActive = true');
            assert.strictEqual(state2.debugActive, true, 'TEST_CMD_2 should have debugActive = true');
            
            // Act: Unregister one session
            manager.unregisterDebugSession(mockSession1);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify only the unregistered command has debugActive = false
            const newState1 = manager.getButtonState('TEST_CMD_1');
            const newState2 = manager.getButtonState('TEST_CMD_2');
            
            assert.strictEqual(newState1.debugActive, false, 'TEST_CMD_1 should have debugActive = false after unregistering');
            assert.strictEqual(newState2.debugActive, true, 'TEST_CMD_2 should still have debugActive = true');
        });

        test('should detect state change when debugActive changes', async () => {
            // Setup: Create manager and reset callback spy
            manager = new CommandStateManager({ onUpdate: onUpdateCallback }, mockCommands);
            await new Promise(resolve => setTimeout(resolve, 10));
            onUpdateCallback.resetHistory();
            
            const mockSession = {
                id: 'test-session-7',
                type: 'rdbg',
                name: 'Attach to rdbg (TEST_CMD_1)',
                workspaceFolder: undefined,
                configuration: {
                    type: 'rdbg',
                    name: 'Attach to rdbg (TEST_CMD_1)',
                    request: 'attach'
                }
            } as vscode.DebugSession;
            
            // Act: Register debug session (should trigger state change)
            manager.registerDebugSession('TEST_CMD_1', mockSession);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Assert: Verify onUpdate was called due to debugActive state change
            assert.ok(onUpdateCallback.called, 'onUpdate should be called when debugActive state changes');
        });
    });
});
