import * as assert from 'assert';
import { ProcessTracker } from '../processTracker';
import * as sinon from 'sinon';
import * as utils from '../utils';

suite('Process Termination Reason Tests', () => {
    const testCode = 'TEST_PROCESS';
    
    setup(() => {
        // Mock workspaceHash to return a predictable value
        sinon.stub(utils, 'workspaceHash').returns('mock-hash-1234');
    });
    
    teardown(() => {
        // Clean up any test files
        try {
            ProcessTracker.clearTerminationReason(testCode);
        } catch (error) {
            // Ignore cleanup errors
        }
        sinon.restore();
    });

    test('should track user-requested termination', () => {
        ProcessTracker.setTerminationReason(testCode, 'user-requested');
        const reason = ProcessTracker.getTerminationReason(testCode);
        assert.strictEqual(reason, 'user-requested');
    });

    test('should track crashed termination', () => {
        ProcessTracker.setTerminationReason(testCode, 'crashed');
        const reason = ProcessTracker.getTerminationReason(testCode);
        assert.strictEqual(reason, 'crashed');
    });

    test('should return none for non-existent termination reason', () => {
        const reason = ProcessTracker.getTerminationReason('NONEXISTENT');
        assert.strictEqual(reason, 'none');
    });

    test('should clear termination reason', () => {
        ProcessTracker.setTerminationReason(testCode, 'crashed');
        ProcessTracker.clearTerminationReason(testCode);
        const reason = ProcessTracker.getTerminationReason(testCode);
        assert.strictEqual(reason, 'none');
    });

    test('should clear all termination reasons', () => {
        ProcessTracker.setTerminationReason('TEST1', 'crashed');
        ProcessTracker.setTerminationReason('TEST2', 'user-requested');
        
        ProcessTracker.clearAllTerminationReasons();
        
        assert.strictEqual(ProcessTracker.getTerminationReason('TEST1'), 'none');
        assert.strictEqual(ProcessTracker.getTerminationReason('TEST2'), 'none');
    });
});
