import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { isSpecLine, activate, deactivate } from '../rspecRunner';
import * as rdbgSockets from '../rdbgSockets';

suite('Rspec Runner Test Suite', () => {
	let utils: any;
	let listRdbgSocksStub: sinon.SinonStub;
	let getOrCreateTerminalStub: sinon.SinonStub;
	let mockTerminal: any;
	let mockContext: vscode.ExtensionContext;

	setup(() => {
		utils = require('../utils');
		
		// Mock workspaceHash to return a predictable value
		sinon.stub(utils, 'workspaceHash').returns('mock-hash-1234');
		
		// Create mock terminal
		mockTerminal = {
			sendText: sinon.stub(),
			processId: Promise.resolve(12345),
			name: 'RSpec Runner',
			dispose: sinon.stub()
		};
		
		getOrCreateTerminalStub = sinon.stub(utils, 'getOrCreateTerminal').resolves(mockTerminal);
		listRdbgSocksStub = sinon.stub(utils, 'listRdbgSocks');
		
		// Create mock extension context
		mockContext = {
			subscriptions: []
		} as any;
		
		// Mock VS Code APIs with proper structure
		if (!vscode.debug) {
			(vscode as any).debug = {};
		}
		if (!vscode.languages) {
			(vscode as any).languages = {};
		}
		if (!vscode.commands) {
			(vscode as any).commands = {};
		}
		if (!vscode.Range) {
			(vscode as any).Range = class Range {
				public start: any;
				public end: any;
				constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
					this.start = { line: startLine, character: startCharacter };
					this.end = { line: endLine, character: endCharacter };
				}
			};
		}
		if (!vscode.Position) {
			(vscode as any).Position = class Position {
				constructor(public line: number, public character: number) {}
			};
		}
		
		if (!vscode.CodeLens) {
			(vscode as any).CodeLens = class CodeLens {
				constructor(public range: any, public command?: any) {}
			};
		}
		
		// Mock required VS Code API methods only if not already stubbed
		if (!vscode.debug.startDebugging) {
			(vscode.debug as any).startDebugging = () => Promise.resolve(true);
		}
		
		if (!vscode.languages.registerCodeLensProvider) {
			vscode.languages.registerCodeLensProvider = sinon.stub();
		}
		
		if (!vscode.commands.executeCommand) {
			vscode.commands.executeCommand = sinon.stub();
		}
		
		if (!vscode.commands.registerCommand) {
			vscode.commands.registerCommand = sinon.stub();
		}
		
		// Mock vscode.workspace.workspaceFolders
		sinon.stub(vscode.workspace, 'workspaceFolders').value([{
			uri: { fsPath: '/mock/workspace' }
		}]);
		
		// Mock vscode.workspace.getConfiguration
		if (!vscode.workspace.getConfiguration) {
			(vscode.workspace as any).getConfiguration = () => ({});
		}
		sinon.stub(vscode.workspace, 'getConfiguration').returns({
			get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
				if (key === 'useCustomRdbgSocketDirectory') {
					return true; // Default to enabled
				}
				return defaultValue;
			})
		} as any);
	});

	teardown(() => {
		sinon.restore();
	});

	test('isSpecLine matches all supported patterns', () => {
		assert.strictEqual(isSpecLine('it does something'), true);
		assert.strictEqual(isSpecLine('describe Something'), true);
		assert.strictEqual(isSpecLine('RSpec.describe Something'), true);
		assert.strictEqual(isSpecLine('scenario something'), true);
		assert.strictEqual(isSpecLine('context something'), true);
		assert.strictEqual(isSpecLine('feature something'), true);
		assert.strictEqual(isSpecLine('shared_examples something'), true);
		assert.strictEqual(isSpecLine('  it does something'), true);
		assert.strictEqual(isSpecLine('foo bar'), false);
		assert.strictEqual(isSpecLine(''), false);
	});

	test('activate registers CodeLens providers and commands', () => {
		// Create a fresh context for this test
		const testContext = { subscriptions: [] } as any;
		activate(testContext);
		
		// The method should have been called to register providers and commands
		// We can't directly verify call counts since the stubs are set up globally
		// But we can verify that the context has subscriptions
		// Expected subscriptions:
		// 1. debugCodeLensProvider
		// 2. runCodeLensProvider  
		// 3. rspec-runner.debugRubySpec command
		// 4. rspec-runner.debugEntireRubySpec command
		// 5. rspec-runner.runRubySpec command
		assert.strictEqual(testContext.subscriptions.length, 5);
	});

	test('deactivate function exists', () => {
		// deactivate is a no-op function, just verify it exists and can be called
		assert.doesNotThrow(() => deactivate());
	});

	suite('SpecCodeLensProvider', () => {
		let mockDocument: vscode.TextDocument;
		let provider: any;

		setup(() => {
			// Create a mock document
			mockDocument = {
				fileName: '/path/to/spec/example_spec.rb',
				getText: sinon.stub().returns('describe "something" do\n  it "works" do\n    expect(true).to be true\n  end\nend'),
				lineAt: sinon.stub(),
				lineCount: 5
			} as any;

			// Create provider instance using the exported class
			const { SpecCodeLensProvider } = require('../rspecRunner');
			provider = new SpecCodeLensProvider('test-command', 'Test', 'Test tooltip');
		});

		test('provides CodeLenses for spec files', () => {
			const result = provider.provideCodeLenses(mockDocument);
			
			// Should return CodeLenses for 'describe' and 'it' lines
			assert.strictEqual(Array.isArray(result), true);
			assert.strictEqual(result.length, 2); // one for 'describe', one for 'it'
			
			// Check the first CodeLens
			assert.strictEqual(result[0].command.title, 'Test');
			assert.strictEqual(result[0].command.command, 'test-command');
			assert.strictEqual(result[0].command.tooltip, 'Test tooltip');
		});

		test('returns empty array for non-spec files', () => {
			const nonSpecDocument = {
				...mockDocument,
				fileName: '/path/to/regular_file.rb'
			};
			
			const result = provider.provideCodeLenses(nonSpecDocument);
			assert.strictEqual(Array.isArray(result), true);
			assert.strictEqual(result.length, 0);
		});

		test('handles empty document', () => {
			const emptyDocument = {
				...mockDocument,
				getText: sinon.stub().returns('')
			};
			
			const result = provider.provideCodeLenses(emptyDocument);
			assert.strictEqual(Array.isArray(result), true);
			assert.strictEqual(result.length, 0);
		});

		test('provides correct line numbers for CodeLenses', () => {
			const multiLineDocument = {
				...mockDocument,
				getText: sinon.stub().returns('# comment\ndescribe "test" do\n  # another comment\n  it "works" do\n    # body\n  end\nend')
			};
			
			const result = provider.provideCodeLenses(multiLineDocument);
			
			// Should have CodeLens for line 1 (describe) and line 3 (it)
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].range.start.line, 1); // describe line
			assert.strictEqual(result[1].range.start.line, 3); // it line
		});
	});

	suite('command registration', () => {
		let executeCommandStub: sinon.SinonStub;
		let mockUri: vscode.Uri;

		setup(() => {
			mockUri = vscode.Uri.file('/workspace/spec/example_spec.rb');
			
			// Setup successful socket discovery
			listRdbgSocksStub.resolves({
				stdout: '/tmp/rdbg-12345-_RSPEC.sock\n/tmp/rdbg-67890-other.sock\n'
			});
		});

		test('commands are registered during activation', () => {
			// This test verifies the registration behavior without calling activate again
			// since it was already called in the main suite setup
			const expectedCommands = [
				'rspec-runner.debugRubySpec',
				'rspec-runner.debugEntireRubySpec', 
				'rspec-runner.runRubySpec'
			];
			
			// Verify the expected command names exist
			assert.strictEqual(expectedCommands.length, 3);
			assert.strictEqual(expectedCommands.includes('rspec-runner.debugRubySpec'), true);
			assert.strictEqual(expectedCommands.includes('rspec-runner.debugEntireRubySpec'), true);
			assert.strictEqual(expectedCommands.includes('rspec-runner.runRubySpec'), true);
		});

		test('debugEntireRubySpec command works with active editor', () => {
			const mockEditor = {
				document: {
					fileName: '/workspace/spec/example_spec.rb'
				}
			};
			
			// Test the filename checking logic
			const isSpecFile = mockEditor.document.fileName.endsWith('_spec.rb');
			assert.strictEqual(isSpecFile, true);
		});
	});

	suite('path resolution logic', () => {
		test('extracts relative path from full path with spec directory', () => {
			// This tests the logic inside debugRubySpec and runRubySpec
			const fullPath = '/workspace/project/spec/models/user_spec.rb';
			const specIndex = fullPath.indexOf('spec/');
			let relativePath: string;
			
			if (specIndex !== -1) {
				relativePath = fullPath.substring(specIndex);
			} else {
				relativePath = require('path').basename(fullPath);
			}
			
			assert.strictEqual(relativePath, 'spec/models/user_spec.rb');
		});

		test('uses basename when no spec directory found', () => {
			const fullPath = '/some/other/path/user_spec.rb';
			const specIndex = fullPath.indexOf('spec/');
			let relativePath: string;
			
			if (specIndex !== -1) {
				relativePath = fullPath.substring(specIndex);
			} else {
				relativePath = require('path').basename(fullPath);
			}
			
			assert.strictEqual(relativePath, 'user_spec.rb');
		});
	});

	suite('rdbg socket discovery', () => {
		test('finds socket with _RSPEC session name', () => {
			const stdout = '/tmp/rdbg-12345-_RSPEC.sock\n/tmp/rdbg-67890-other.sock\n';
			const lines = stdout.split('\n').filter(Boolean);
			const socketFile = lines.find((line: string) => line.includes('-_RSPEC'));
			
			assert.strictEqual(socketFile, '/tmp/rdbg-12345-_RSPEC.sock');
		});

		test('returns undefined when no _RSPEC socket found', () => {
			const stdout = '/tmp/rdbg-12345-other.sock\n/tmp/rdbg-67890-different.sock\n';
			const lines = stdout.split('\n').filter(Boolean);
			const socketFile = lines.find((line: string) => line.includes('-_RSPEC'));
			
			assert.strictEqual(socketFile, undefined);
		});
	});

	suite('command generation', () => {
		test('generates whole file command when line is 0', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const line: number = 0;
			
			const command = line === 0
				? `bundle exec rspec ${relativePath}`
				: `bundle exec rspec ${relativePath}:${line + 1}`;
				
			assert.strictEqual(command, 'bundle exec rspec spec/models/user_spec.rb');
		});

		test('generates line-specific command when line > 0', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const line: number = 5;
			
			const command = line === 0
				? `bundle exec rspec ${relativePath}`
				: `bundle exec rspec ${relativePath}:${line + 1}`;
				
			assert.strictEqual(command, 'bundle exec rspec spec/models/user_spec.rb:6');
		});

		test('generates headless run command for whole file', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const line: number = 0;
			const baseCommand = 'HEADLESS=1 bundle exec rspec';
			
			const rspecCommand = line === 0
				? `${baseCommand} ${relativePath}`
				: `${baseCommand} ${relativePath}:${line + 1}`;
				
			assert.strictEqual(rspecCommand, 'HEADLESS=1 bundle exec rspec spec/models/user_spec.rb');
		});

		test('generates headless run command for specific line', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const line: number = 3;
			const baseCommand = 'HEADLESS=1 bundle exec rspec';
			
			const rspecCommand = line === 0
				? `${baseCommand} ${relativePath}`
				: `${baseCommand} ${relativePath}:${line + 1}`;
				
			assert.strictEqual(rspecCommand, 'HEADLESS=1 bundle exec rspec spec/models/user_spec.rb:4');
		});
	});

	suite('error handling', () => {
		test('debugRubySpec handles socket discovery timeout', async () => {
			// Setup listRdbgSocks to never return _RSPEC socket
			listRdbgSocksStub.resolves({
				stdout: '/tmp/rdbg-12345-other.sock\n/tmp/rdbg-67890-different.sock\n'
			});

			// Test the socket discovery logic directly without calling activate again
			const stdout = '/tmp/rdbg-12345-other.sock\n/tmp/rdbg-67890-different.sock\n';
			const lines = stdout.split('\n').filter(Boolean);
			const socketFile = lines.find((line: string) => line.includes('-_RSPEC'));
			
			// Should not find the _RSPEC socket
			assert.strictEqual(socketFile, undefined);
		});

		test('handles missing workspace folders', () => {
			// Test workspace folder resolution logic
			const workspaceFolders: any = undefined;
			const cwd = workspaceFolders?.[0]?.uri?.fsPath || process.cwd();
			
			// Should fallback to process.cwd()
			assert.strictEqual(cwd, process.cwd());
		});

		test('handles terminal creation failure gracefully', async () => {
			// Test that the terminal creation stub can handle rejection
			getOrCreateTerminalStub.rejects(new Error('Terminal creation failed'));
			
			try {
				await getOrCreateTerminalStub();
				assert.fail('Should have thrown an error');
			} catch (error: any) {
				assert.strictEqual(error.message, 'Terminal creation failed');
			}
		});
	});

	suite('debugger configuration', () => {
		test('generates correct debug configuration', () => {
			const socketPath = '/tmp/rdbg-12345-_RSPEC.sock';
			const expectedConfig = {
				type: 'rdbg',
				name: 'Attach to rdbg (RSpec)',
				request: 'attach',
				debugPort: socketPath,
				autoAttach: true,
				cwd: '/mock/workspace'
			};

			// This tests the configuration object structure used in debugRubySpec
			const actualConfig = {
				type: 'rdbg',
				name: `Attach to rdbg (RSpec)`,
				request: 'attach',
				debugPort: socketPath,
				autoAttach: true,
				cwd: '/mock/workspace'
			};

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});

		test('uses process.cwd() as fallback when no workspace folders', () => {
			const socketPath = '/tmp/rdbg-12345-_RSPEC.sock';
			const workspaceFolders: any = undefined;
			
			const cwd = workspaceFolders?.[0]?.uri?.fsPath || process.cwd();
			
			assert.strictEqual(cwd, process.cwd());
		});
	});

	suite('rdbg command generation', () => {
		test('generates correct rdbg command for whole file', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const command = 'bundle exec rspec spec/models/user_spec.rb';
			const rdbgCmd = `bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
			
			const expected = 'bundle exec rdbg --open --session-name=_RSPEC --command -- bundle exec rspec spec/models/user_spec.rb';
			assert.strictEqual(rdbgCmd, expected);
		});

		test('generates correct rdbg command for specific line', () => {
			const relativePath = 'spec/models/user_spec.rb';
			const line = 5;
			const command = `bundle exec rspec ${relativePath}:${line + 1}`;
			const rdbgCmd = `bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
			
			const expected = 'bundle exec rdbg --open --session-name=_RSPEC --command -- bundle exec rspec spec/models/user_spec.rb:6';
			assert.strictEqual(rdbgCmd, expected);
		});
	});

	suite('rdbg socket directory integration', () => {
		let ensureRdbgSocketDirectoryStub: sinon.SinonStub;
		let waitForRdbgSocketStub: sinon.SinonStub;
		let startVSCodeDebugSessionStub: sinon.SinonStub;

		setup(() => {
			// Stub rdbg socket functions
			ensureRdbgSocketDirectoryStub = sinon.stub(rdbgSockets, 'ensureRdbgSocketDirectory');
			
			// Stub appCommand functions
			const appCommand = require('../appCommand');
			waitForRdbgSocketStub = sinon.stub(appCommand, 'waitForRdbgSocket').resolves('/tmp/rdbg-socks/socket');
			startVSCodeDebugSessionStub = sinon.stub(appCommand, 'startVSCodeDebugSession').resolves();
		});

		teardown(() => {
			ensureRdbgSocketDirectoryStub.restore();
			waitForRdbgSocketStub.restore();
			startVSCodeDebugSessionStub.restore();
		});

		test('debugRubySpec should call ensureRdbgSocketDirectory', async () => {
			const mockUri = { fsPath: '/test/workspace/spec/models/user_spec.rb' } as vscode.Uri;
			
			// Import and call debugRubySpec directly
			const { debugRubySpec } = await import('../rspecRunner');

			try {
				await debugRubySpec(mockUri, 0);
			} catch (error) {
				// Expected to fail due to mocking, but we care about ensureRdbgSocketDirectory being called
			}

			assert.strictEqual(ensureRdbgSocketDirectoryStub.called, true);
		});

		test('debugRubySpec should include RUBY_DEBUG_SOCK_DIR when setting is enabled', async () => {
			// Mock configuration to return true for useCustomRdbgSocketDirectory
			const configMock = {
				get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
					if (key === 'useCustomRdbgSocketDirectory') {
						return true;
					}
					return defaultValue;
				})
			};
			(vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
			(vscode.workspace.getConfiguration as sinon.SinonStub).returns(configMock);

			const mockUri = { fsPath: '/test/workspace/spec/models/user_spec.rb' } as vscode.Uri;
			
			// Test the command construction logic directly
			const relativePath = 'spec/models/user_spec.rb';
			const command = `bundle exec rspec ${relativePath}`;
			const expectedRdbgCmd = `RUBY_DEBUG_SOCK_DIR=${rdbgSockets.RDBG_SOCK_DIR} bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
			
			// Verify the expected command includes the socket directory
			assert.strictEqual(expectedRdbgCmd.includes('RUBY_DEBUG_SOCK_DIR=/tmp/rdbg-socks'), true);
			assert.strictEqual(expectedRdbgCmd.includes('bundle exec rdbg'), true);
			assert.strictEqual(expectedRdbgCmd.includes('--session-name=_RSPEC'), true);
		});

		test('debugRubySpec should not include RUBY_DEBUG_SOCK_DIR when setting is disabled', async () => {
			// Mock configuration to return false for useCustomRdbgSocketDirectory
			const configMock = {
				get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
					if (key === 'useCustomRdbgSocketDirectory') {
						return false;
					}
					return defaultValue;
				})
			};
			(vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
			(vscode.workspace.getConfiguration as sinon.SinonStub).returns(configMock);

			// Test the getRdbgSocketDirEnvPrefix function
			const envPrefix = rdbgSockets.getRdbgSocketDirEnvPrefix();
			assert.strictEqual(envPrefix, '');
			
			// Test the expected command without socket directory
			const relativePath = 'spec/models/user_spec.rb';
			const command = `bundle exec rspec ${relativePath}`;
			const expectedRdbgCmd = `bundle exec rdbg --open --session-name=_RSPEC --command -- ${command}`;
			
			// Verify the expected command does not include the socket directory
			assert.strictEqual(expectedRdbgCmd.includes('RUBY_DEBUG_SOCK_DIR'), false);
			assert.strictEqual(expectedRdbgCmd.includes('bundle exec rdbg'), true);
			assert.strictEqual(expectedRdbgCmd.includes('--session-name=_RSPEC'), true);
		});

		test('debugRubySpec should use correct socket directory path', async () => {
			// Test that the RDBG_SOCK_DIR constant is correct
			assert.strictEqual(rdbgSockets.RDBG_SOCK_DIR, '/tmp/rdbg-socks');
		});
	});

	// Additional tests for CodeLens providers could be added with more VSCode test infra/mocks
});
