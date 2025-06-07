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
});
