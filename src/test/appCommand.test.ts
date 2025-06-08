import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as JSON5 from 'json5';
import { loadAppConfig, getDefaultAppConfig, appCommandsFileExists, saveAppConfig } from '../appCommand';
import { AppConfig } from '../types';

suite('AppCommand Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockWorkspaceFolder: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock vscode workspace
        mockWorkspaceFolder = {
            uri: { fsPath: '/test/workspace' }
        };
        
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspaceFolder]);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('loadAppConfig', () => {
        test('should return default config when file does not exist', () => {
            sandbox.stub(fs, 'existsSync').returns(false);

            const config = loadAppConfig();
            const defaultConfig = getDefaultAppConfig();

            assert.deepStrictEqual(config, defaultConfig);
        });

        test('should parse valid JSON file', () => {
            const testConfig: AppConfig = {
                commands: [
                    {
                        code: 'TEST',
                        description: 'Test Command',
                        command: 'echo test',
                        commandType: 'shell'
                    }
                ]
            };

            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testConfig));

            const config = loadAppConfig();

            assert.deepStrictEqual(config, testConfig);
        });

        test('should parse JSONC file with line comments', () => {
            const testConfig: AppConfig = {
                commands: [
                    {
                        code: 'TEST',
                        description: 'Test Command',
                        command: 'echo test',
                        commandType: 'shell'
                    }
                ]
            };

            const jsoncContent = `{
  // This is a comment
  "commands": [
    {
      "code": "TEST", // Command identifier
      "description": "Test Command",
      "command": "echo test", // The actual command
      "commandType": "shell"
    }
  ]
  // End of file comment
}`;

            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(jsoncContent);

            const config = loadAppConfig();

            assert.deepStrictEqual(config, testConfig);
        });

        test('should parse JSONC file with block comments', () => {
            const testConfig: AppConfig = {
                commands: [
                    {
                        code: 'TEST',
                        description: 'Test Command',
                        command: 'echo test',
                        commandType: 'shell'
                    }
                ]
            };

            const jsoncContent = `{
  /* This is a block comment */
  "commands": [
    {
      "code": "TEST", /* Command identifier */
      "description": "Test Command",
      "command": "echo test", /* The actual command */
      "commandType": "shell"
    }
  ]
  /* End of file comment */
}`;

            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(jsoncContent);

            const config = loadAppConfig();

            assert.deepStrictEqual(config, testConfig);
        });

        test('should parse JSONC file with trailing commas', () => {
            const testConfig: AppConfig = {
                commands: [
                    {
                        code: 'TEST',
                        description: 'Test Command',
                        command: 'echo test',
                        commandType: 'shell'
                    }
                ]
            };

            const jsoncContent = `{
  "commands": [
    {
      "code": "TEST",
      "description": "Test Command",
      "command": "echo test",
      "commandType": "shell",
    },
  ],
}`;

            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(jsoncContent);

            const config = loadAppConfig();

            assert.deepStrictEqual(config, testConfig);
        });
    });

    suite('appCommandsFileExists', () => {
        test('should return true when file exists', () => {
            sandbox.stub(fs, 'existsSync').returns(true);

            const exists = appCommandsFileExists();

            assert.strictEqual(exists, true);
        });

        test('should return false when file does not exist', () => {
            sandbox.stub(fs, 'existsSync').returns(false);

            const exists = appCommandsFileExists();

            assert.strictEqual(exists, false);
        });

        test('should return false when fs.existsSync throws', () => {
            sandbox.stub(fs, 'existsSync').throws(new Error('File system error'));

            const exists = appCommandsFileExists();

            assert.strictEqual(exists, false);
        });
    });

    suite('saveAppConfig', () => {
        test('should save config to correct path', () => {
            const testConfig: AppConfig = {
                commands: [
                    {
                        code: 'TEST',
                        description: 'Test Command',
                        command: 'echo test',
                        commandType: 'shell'
                    }
                ]
            };

            const mkdirSyncStub = sandbox.stub(fs, 'mkdirSync');
            const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
            const existsSyncStub = sandbox.stub(fs, 'existsSync').returns(false);

            saveAppConfig(testConfig);

            assert.strictEqual(mkdirSyncStub.calledOnce, true);
            assert.strictEqual(mkdirSyncStub.firstCall.args[0], '/test/workspace/.vscode');
            assert.deepStrictEqual(mkdirSyncStub.firstCall.args[1], { recursive: true });

            assert.strictEqual(writeFileSyncStub.calledOnce, true);
            assert.strictEqual(writeFileSyncStub.firstCall.args[0], '/test/workspace/.vscode/app_commands.jsonc');
            assert.strictEqual(writeFileSyncStub.firstCall.args[1], JSON.stringify(testConfig, null, 2));
            assert.strictEqual(writeFileSyncStub.firstCall.args[2], 'utf8');
        });

        test('should not create directory if it already exists', () => {
            const testConfig: AppConfig = {
                commands: []
            };

            const mkdirSyncStub = sandbox.stub(fs, 'mkdirSync');
            const writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
            const existsSyncStub = sandbox.stub(fs, 'existsSync').returns(true);

            saveAppConfig(testConfig);

            assert.strictEqual(mkdirSyncStub.called, false);
            assert.strictEqual(writeFileSyncStub.calledOnce, true);
        });
    });

    suite('getDefaultAppConfig', () => {
        test('should return consistent default configuration', () => {
            const config1 = getDefaultAppConfig();
            const config2 = getDefaultAppConfig();

            assert.deepStrictEqual(config1, config2);
            assert.strictEqual(config1.commands.length, 3);
            assert.strictEqual(config1.commands[0].code, 'RAILS');
            assert.strictEqual(config1.commands[1].code, 'JOBS');
            assert.strictEqual(config1.commands[2].code, 'WEBPACK');
        });
    });
});
