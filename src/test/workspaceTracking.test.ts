import * as assert from 'assert';
import * as sinon from 'sinon';
import { FsHelperMock } from './helpers/fsHelperMock';

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
import * as utils from '../utils';

suite('Workspace Tracking', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        FsHelperMock.mock(sandbox);
        
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
          
            ProcessTracker.setWorkspaceHash(code, testHash);
            const retrievedHash = ProcessTracker.getWorkspaceHash(code);
            
            assert.strictEqual(retrievedHash, testHash);
            
            // Clean up - mock that file exists for clearing
            ProcessTracker.clearWorkspaceHash(code);
        });

        test('should return undefined for non-existent workspace hash', () => {
            const result = ProcessTracker.getWorkspaceHash('NONEXISTENT');
            assert.strictEqual(result, undefined);
        });

        test('should clear workspace hash', () => {
            const code = 'TEST_CLEAR_WORKSPACE';
            const testHash = 'def67890';
            
            ProcessTracker.setWorkspaceHash(code, testHash);
            ProcessTracker.clearWorkspaceHash(code);
            
            const result = ProcessTracker.getWorkspaceHash(code);
            assert.strictEqual(result, undefined);
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
    });
});
