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

    test('should track additional forbidden vars', () => {
        const vars = ['CUSTOM_VAR1', 'CUSTOM_VAR2'];
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars);
        const retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars);
    });

    test('should return empty array for non-existent additional forbidden vars', () => {
        const vars = ProcessTracker.getAdditionalForbiddenVars('NONEXISTENT');
        assert.deepStrictEqual(vars, []);
    });

    test('should preserve additional forbidden vars when setting termination reason', () => {
        const vars = ['VAR1', 'VAR2'];
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars);
        ProcessTracker.setTerminationReason(testCode, 'crashed');
        
        const retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars);
        assert.strictEqual(ProcessTracker.getTerminationReason(testCode), 'crashed');
    });

    test('should preserve termination reason when setting additional forbidden vars', () => {
        ProcessTracker.setTerminationReason(testCode, 'user-requested');
        const vars = ['VAR1', 'VAR2'];
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars);
        
        assert.strictEqual(ProcessTracker.getTerminationReason(testCode), 'user-requested');
        const retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars);
    });

    test('should preserve workspace hash when setting additional forbidden vars', () => {
        ProcessTracker.setWorkspaceHash(testCode, 'test-hash-456');
        const vars = ['VAR1', 'VAR2'];
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars);
        
        assert.strictEqual(ProcessTracker.getWorkspaceHash(testCode), 'test-hash-456');
        const retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars);
    });

    test('should handle empty additional forbidden vars array', () => {
        const vars: string[] = [];
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars);
        const retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, []);
    });

    test('should update additional forbidden vars when called multiple times', () => {
        const vars1 = ['VAR1', 'VAR2'];
        const vars2 = ['VAR3', 'VAR4', 'VAR5'];
        
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars1);
        let retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars1);
        
        ProcessTracker.setAdditionalForbiddenVars(testCode, vars2);
        retrievedVars = ProcessTracker.getAdditionalForbiddenVars(testCode);
        assert.deepStrictEqual(retrievedVars, vars2);
    });
});
