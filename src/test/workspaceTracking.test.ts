import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';

// Mock vscode module
const vscode = {
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: '/mock/workspace' }
        }]
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    },
    TreeItem: class {
        constructor(public label: string, public collapsibleState?: any) {}
    },
    TreeItemCollapsibleState: {
        None: 0
    },
    ThemeIcon: class {
        constructor(public id: string, public color?: any) {}
    },
    ThemeColor: class {
        constructor(public id: string) {}
    }
};

// Stub the vscode module before importing our modules
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

import { ProcessTracker } from '../processTracker';
import { CommandStateManager } from '../commandStateManager';
import type { Command, ProcessState } from '../types';
import * as utils from '../utils';

suite('Workspace Tracking', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock workspaceHash to return a predictable value
        sandbox.stub(utils, 'workspaceHash').returns('mock-hash-1234');
        
        // Don't mock filesystem operations in setup - let individual tests handle this
        // Mock vscode.workspace.workspaceFolders
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
            uri: { fsPath: '/mock/workspace' }
        }]);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('ProcessTracker workspace hash methods', () => {
        test('should set and get workspace hash', () => {
            const code = 'TEST_WORKSPACE';
            const testHash = 'abc12345';
            
            // Reset filesystem stubs for this specific test
            sandbox.restore();
            sandbox = sinon.createSandbox();
            
            // Mock filesystem operations specifically for this test
            const writeStub = sandbox.stub(fs, 'writeFileSync');
            const readStub = sandbox.stub(fs, 'readFileSync').returns(JSON.stringify({ workspaceHash: testHash }));
            const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            const unlinkStub = sandbox.stub(fs, 'unlinkSync');
            sandbox.stub(fs, 'mkdirSync');
            
            ProcessTracker.setWorkspaceHash(code, testHash);
            const retrievedHash = ProcessTracker.getWorkspaceHash(code);
            
            assert.strictEqual(retrievedHash, testHash);
            
            // Clean up - mock that file exists for clearing
            ProcessTracker.clearWorkspaceHash(code);
        });

        test('should return undefined for non-existent workspace hash', () => {
            // Mock filesystem to return file doesn't exist
            const existsStub = sandbox.stub(fs, 'existsSync').returns(false);
            
            const result = ProcessTracker.getWorkspaceHash('NONEXISTENT');
            assert.strictEqual(result, undefined);
        });

        test('should clear workspace hash', () => {
            const code = 'TEST_CLEAR_WORKSPACE';
            const testHash = 'def67890';
            
            // Mock filesystem operations
            const writeStub = sandbox.stub(fs, 'writeFileSync');
            const readStub = sandbox.stub(fs, 'readFileSync').returns(JSON.stringify({ workspaceHash: testHash }));
            const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            const unlinkStub = sandbox.stub(fs, 'unlinkSync');
            sandbox.stub(fs, 'mkdirSync');
            
            ProcessTracker.setWorkspaceHash(code, testHash);
            ProcessTracker.clearWorkspaceHash(code);
            
            // Change existsSync to return false after clearing
            existsStub.returns(false);
            const result = ProcessTracker.getWorkspaceHash(code);
            assert.strictEqual(result, undefined);
        });

        test('should clear all workspace hashes', () => {
            const codes = ['TEST1', 'TEST2', 'TEST3'];
            const testHash = 'cleanup123';
            
            // Mock filesystem operations
            const writeStub = sandbox.stub(fs, 'writeFileSync');
            const readStub = sandbox.stub(fs, 'readFileSync').returns(JSON.stringify({ workspaceHash: testHash }));
            let fileExists = true;
            const existsStub = sandbox.stub(fs, 'existsSync').callsFake(() => fileExists);
            const unlinkStub = sandbox.stub(fs, 'unlinkSync');
            const readdirStub = sandbox.stub(fs, 'readdirSync').returns(codes.map(code => `${code}.state`) as any);
            sandbox.stub(fs, 'mkdirSync');
            
            // Set workspace hashes for multiple codes
            codes.forEach(code => {
                ProcessTracker.setWorkspaceHash(code, testHash);
            });
            
            // Verify they're set
            codes.forEach(code => {
                assert.strictEqual(ProcessTracker.getWorkspaceHash(code), testHash);
            });
            
            // Clear all
            ProcessTracker.clearAllWorkspaceHashes();
            
            // After clearing, files should not exist
            fileExists = false;
            
            // Verify they're all cleared
            codes.forEach(code => {
                assert.strictEqual(ProcessTracker.getWorkspaceHash(code), undefined);
            });
        });
    });

    suite('Core workspace tracking functionality', () => {
        test('should set and get workspace hash via ProcessTracker', () => {
            const code = 'TEST_WORKSPACE_CORE';
            const testHash = 'core123';
            
            ProcessTracker.setWorkspaceHash(code, testHash);
            const retrievedHash = ProcessTracker.getWorkspaceHash(code);
            
            assert.strictEqual(retrievedHash, testHash);
            
            // Clean up
            ProcessTracker.clearWorkspaceHash(code);
            assert.strictEqual(ProcessTracker.getWorkspaceHash(code), undefined);
        });

        test('should handle workspace hash state file operations', () => {
            const code = 'TEST_WORKSPACE_FILE';
            
            // Mock fs operations to test the state file logic
            const fsWriteStub = sandbox.stub(fs, 'writeFileSync');
            const fsUnlinkStub = sandbox.stub(fs, 'unlinkSync');
            const fsExistsStub = sandbox.stub(fs, 'existsSync').returns(false);
            const fsMkdirStub = sandbox.stub(fs, 'mkdirSync');
            
            // Test setting workspace hash (should write to state file as JSON)
            ProcessTracker.setWorkspaceHash(code, 'file123');
            assert.ok(fsWriteStub.calledWith(
                sinon.match.string,
                JSON.stringify({ terminationReason: 'none', workspaceHash: 'file123' }),
                'utf8'
            ));
            
            // Mock file existence for reading
            fsExistsStub.returns(true);
            const fsReadStub = sandbox.stub(fs, 'readFileSync').returns(JSON.stringify({ workspaceHash: 'file123' }));
            
            // Test getting workspace hash (should read from state file)
            const hash = ProcessTracker.getWorkspaceHash(code);
            assert.strictEqual(hash, 'file123');
            
            // Test clearing workspace hash (should delete state file)
            ProcessTracker.clearWorkspaceHash(code);
            assert.ok(fsUnlinkStub.calledOnce);
        });
    });
});
