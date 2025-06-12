import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeatureStateManager } from '../featureStateManager';
import { Feature } from '../types';

suite('FeatureStateManager Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let mockWorkspaceState: vscode.Memento;
    let featureStateManager: FeatureStateManager;

    const testFeatures: Feature[] = [
        {
            code: 'DEBUG',
            name: 'Debug Mode',
            description: 'Enables debugging flags',
            environment: {
                whitelist: ['DEBUG', 'VERBOSE'],
                blacklist: ['SILENT', 'QUIET']
            }
        },
        {
            code: 'PERFORMANCE',
            name: 'Performance Monitoring',
            description: 'Enables performance monitoring',
            environment: {
                whitelist: ['PROFILE', 'BENCHMARK'],
                blacklist: ['NO_PROFILING']
            }
        }
    ];

    setup(() => {
        sandbox = sinon.createSandbox();

        // Mock workspace state
        mockWorkspaceState = {
            get: sandbox.stub().callsFake((key: string, defaultValue?: any) => defaultValue || {}),
            update: sandbox.stub().resolves(),
            keys: sandbox.stub().returns([])
        };

        // Mock extension context
        mockContext = {
            workspaceState: mockWorkspaceState,
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub(),
                keys: sandbox.stub().returns([])
            },
            subscriptions: [],
            extensionPath: '/test/path'
        } as any;

        featureStateManager = new FeatureStateManager(mockContext);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Feature State Management', () => {
        test('should return false for disabled feature by default', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({});
            
            const result = featureStateManager.isFeatureEnabled('DEBUG');
            assert.strictEqual(result, false);
        });

        test('should return true for enabled feature', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ DEBUG: true });
            
            const result = featureStateManager.isFeatureEnabled('DEBUG');
            assert.strictEqual(result, true);
        });

        test('should return false for explicitly disabled feature', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ DEBUG: false });
            
            const result = featureStateManager.isFeatureEnabled('DEBUG');
            assert.strictEqual(result, false);
        });

        test('should set feature enabled state', async () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({});
            
            await featureStateManager.setFeatureEnabled('DEBUG', true);
            
            assert.ok((mockWorkspaceState.update as sinon.SinonStub).calledOnce);
            const updateCall = (mockWorkspaceState.update as sinon.SinonStub).getCall(0);
            assert.strictEqual(updateCall.args[0], 'ruby-rails-toolkit.featureStates');
            assert.deepStrictEqual(updateCall.args[1], { DEBUG: true });
        });

        test('should toggle feature state from disabled to enabled', async () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({});
            
            const newState = await featureStateManager.toggleFeature('DEBUG');
            
            assert.strictEqual(newState, true);
            assert.ok((mockWorkspaceState.update as sinon.SinonStub).calledOnce);
        });

        test('should toggle feature state from enabled to disabled', async () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ DEBUG: true });
            
            const newState = await featureStateManager.toggleFeature('DEBUG');
            
            assert.strictEqual(newState, false);
            assert.ok((mockWorkspaceState.update as sinon.SinonStub).calledOnce);
            const updateCall = (mockWorkspaceState.update as sinon.SinonStub).getCall(0);
            assert.deepStrictEqual(updateCall.args[1], { DEBUG: false });
        });

        test('should get all feature states', () => {
            const states = { DEBUG: true, PERFORMANCE: false };
            (mockWorkspaceState.get as sinon.SinonStub).returns(states);
            
            const result = featureStateManager.getAllFeatureStates();
            
            assert.deepStrictEqual(result, states);
        });
    });

    suite('Environment Variable Filtering', () => {
        test('should return empty array for no features', () => {
            const result = featureStateManager.getForbiddenEnvironmentVariables([]);
            assert.deepStrictEqual(result, []);
        });

        test('should add whitelist vars to forbidden when feature is disabled', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ DEBUG: false });
            
            const result = featureStateManager.getForbiddenEnvironmentVariables([testFeatures[0]]);
            
            assert.deepStrictEqual(result, ['DEBUG', 'VERBOSE']);
        });

        test('should add blacklist vars to forbidden when feature is enabled', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ DEBUG: true });
            
            const result = featureStateManager.getForbiddenEnvironmentVariables([testFeatures[0]]);
            
            assert.deepStrictEqual(result, ['SILENT', 'QUIET']);
        });

        test('should handle multiple features with mixed states', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({ 
                DEBUG: false,      // disabled: add whitelist to forbidden
                PERFORMANCE: true  // enabled: add blacklist to forbidden
            });
            
            const result = featureStateManager.getForbiddenEnvironmentVariables(testFeatures);
            
            // DEBUG disabled: whitelist (DEBUG, VERBOSE) forbidden
            // PERFORMANCE enabled: blacklist (NO_PROFILING) forbidden
            const expected = ['DEBUG', 'VERBOSE', 'NO_PROFILING'];
            assert.deepStrictEqual(result.sort(), expected.sort());
        });

        test('should remove duplicates from forbidden vars', () => {
            const featuresWithDuplicates: Feature[] = [
                {
                    code: 'FEATURE1',
                    name: 'Feature 1',
                    description: 'Test feature 1',
                    environment: {
                        whitelist: ['DEBUG', 'VERBOSE'],
                        blacklist: ['SILENT']
                    }
                },
                {
                    code: 'FEATURE2',
                    name: 'Feature 2',
                    description: 'Test feature 2',
                    environment: {
                        whitelist: ['DEBUG', 'INFO'], // DEBUG appears again
                        blacklist: ['QUIET']
                    }
                }
            ];
            
            (mockWorkspaceState.get as sinon.SinonStub).returns({ 
                FEATURE1: false,  // whitelist goes to forbidden
                FEATURE2: false   // whitelist goes to forbidden
            });
            
            const result = featureStateManager.getForbiddenEnvironmentVariables(featuresWithDuplicates);
            
            // Should contain DEBUG only once
            const expected = ['DEBUG', 'VERBOSE', 'INFO'];
            assert.deepStrictEqual(result.sort(), expected.sort());
        });

        test('should handle feature with no state (defaults to disabled)', () => {
            (mockWorkspaceState.get as sinon.SinonStub).returns({}); // No state for any feature
            
            const result = featureStateManager.getForbiddenEnvironmentVariables([testFeatures[0]]);
            
            // Feature defaults to disabled, so whitelist goes to forbidden
            assert.deepStrictEqual(result, ['DEBUG', 'VERBOSE']);
        });
    });
});
