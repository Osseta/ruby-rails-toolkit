import { suite, test, setup, teardown } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';

suite('ANSI Syntax Highlighting Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Rails HTTP Request URL Highlighting', () => {
        let tmLanguageGrammar: any;

        setup(() => {
            // Load the tmLanguage grammar file
            const grammarPath = path.join(__dirname, '../../syntaxes/ansi-colors.tmLanguage.json');
            const grammarContent = fs.readFileSync(grammarPath, 'utf8');
            tmLanguageGrammar = JSON.parse(grammarContent);
        });

        test('should have rails.http.request.url pattern in grammar', () => {
            const patterns = tmLanguageGrammar.patterns;
            const railsPattern = patterns.find((p: any) => p.name === 'rails.http.request.url');
            
            assert.ok(railsPattern, 'rails.http.request.url pattern should exist');
            assert.strictEqual(railsPattern.match, '^Started\\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\\s+(\"[^\"]+\")', 'Pattern should match Rails HTTP request lines');
            assert.strictEqual(railsPattern.captures['1'].name, 'keyword.control.ansi', 'HTTP method should use keyword.control.ansi scope');
            assert.strictEqual(railsPattern.captures['2'].name, 'string.regexp', 'URL should use string.regexp scope');
        });

        test('should match GET request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started GET "/order/21578?et=RYaZEHAXJ2E-kg" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started GET "/admin/order/21578" for 127.0.0.1 at 2025-06-09 19:15:29 +0930',
                'Started GET "/api/v1/users" for 192.168.1.1 at 2025-06-09 10:30:00 +0000'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.strictEqual(match[1], 'GET', 'Should capture HTTP method');
                assert.ok(match[2].startsWith('"') && match[2].endsWith('"'), 'Should capture quoted URL');
            });
        });

        test('should match POST request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started POST "/users" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started POST "/api/v1/sessions" for 192.168.1.100 at 2025-06-09 14:20:30 +0000'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.strictEqual(match[1], 'POST', 'Should capture HTTP method');
                assert.ok(match[2].startsWith('"') && match[2].endsWith('"'), 'Should capture quoted URL');
            });
        });

        test('should match PATCH request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started PATCH "/admin/order/21578/update_address" for 127.0.0.1 at 2025-06-09 19:15:29 +0930',
                'Started PATCH "/users/123" for 10.0.0.1 at 2025-06-09 16:45:00 +0930'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.strictEqual(match[1], 'PATCH', 'Should capture HTTP method');
                assert.ok(match[2].startsWith('"') && match[2].endsWith('"'), 'Should capture quoted URL');
            });
        });

        test('should match DELETE request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started DELETE "/users/123" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started DELETE "/api/v1/sessions/456" for 192.168.1.50 at 2025-06-09 12:00:00 +0000'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.strictEqual(match[1], 'DELETE', 'Should capture HTTP method');
                assert.ok(match[2].startsWith('"') && match[2].endsWith('"'), 'Should capture quoted URL');
            });
        });

        test('should match PUT, HEAD, and OPTIONS request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started PUT "/users/123" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started HEAD "/api/health" for 192.168.1.1 at 2025-06-09 10:00:00 +0000',
                'Started OPTIONS "/api/v1/users" for 10.0.0.5 at 2025-06-09 11:30:45 +0930'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.ok(['PUT', 'HEAD', 'OPTIONS'].includes(match[1]), 'Should capture valid HTTP method');
                assert.ok(match[2].startsWith('"') && match[2].endsWith('"'), 'Should capture quoted URL');
            });
        });

        test('should handle URLs with query parameters', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started GET "/search?q=test&page=1" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started GET "/products?category=electronics&sort=price" for 192.168.1.1 at 2025-06-09 10:30:00 +0000',
                'Started POST "/orders?async=true&notify=false" for 10.0.0.1 at 2025-06-09 14:15:30 +0930'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line with query params: ${line}`);
                assert.ok(match[2].includes('?'), 'Should capture URL with query parameters');
            });
        });

        test('should handle URLs with special characters and paths', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started GET "/admin/users/123/edit" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                'Started POST "/api/v2/webhooks/stripe" for 192.168.1.1 at 2025-06-09 10:30:00 +0000',
                'Started PATCH "/profiles/user-123/settings" for 10.0.0.1 at 2025-06-09 14:15:30 +0930'
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line with complex path: ${line}`);
                assert.ok(match[2].includes('/'), 'Should capture URL with path separators');
            });
        });

        test('should not match non-Rails request lines', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const nonMatchingLines = [
                'Processing by UsersController#show as HTML',
                'Completed 200 OK in 45ms (Views: 23.5ms | ActiveRecord: 12.1ms)',
                'Started processing request',
                'GET /users without quotes',
                'Not a Started GET line',
                'Started GET missing quotes for 127.0.0.1'
            ];

            nonMatchingLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(!match, `Should not match non-Rails request line: ${line}`);
            });
        });

        test('should capture correct groups for syntax highlighting', () => {
            const testCases = [
                {
                    line: 'Started GET "/users" for 127.0.0.1 at 2025-06-09 19:13:13 +0930',
                    expectedMethod: 'GET',
                    expectedUrl: '"/users"'
                },
                {
                    line: 'Started POST "/api/v1/sessions" for 192.168.1.1 at 2025-06-09 10:30:00 +0000',
                    expectedMethod: 'POST',
                    expectedUrl: '"/api/v1/sessions"'
                },
                {
                    line: 'Started PATCH "/admin/order/21578/update_address" for 127.0.0.1 at 2025-06-09 19:15:29 +0930',
                    expectedMethod: 'PATCH',
                    expectedUrl: '"/admin/order/21578/update_address"'
                }
            ];

            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;

            testCases.forEach(({ line, expectedMethod, expectedUrl }) => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line: ${line}`);
                assert.strictEqual(match[1], expectedMethod, `Should capture method: ${expectedMethod}`);
                assert.strictEqual(match[2], expectedUrl, `Should capture URL: ${expectedUrl}`);
            });
        });

        test('should handle edge cases with whitespace', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            const testLines = [
                'Started  GET  "/users"  for 127.0.0.1 at 2025-06-09 19:13:13 +0930', // Extra spaces
                'Started\tPOST\t"/sessions"\tfor 192.168.1.1 at 2025-06-09 10:30:00 +0000' // Tabs
            ];

            testLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match line with extra whitespace: ${line}`);
            });
        });
    });

    suite('Grammar Pattern Order', () => {
        let tmLanguageGrammar: any;

        setup(() => {
            const grammarPath = path.join(__dirname, '../../syntaxes/ansi-colors.tmLanguage.json');
            const grammarContent = fs.readFileSync(grammarPath, 'utf8');
            tmLanguageGrammar = JSON.parse(grammarContent);
        });

        test('rails.http.request.url pattern should be positioned appropriately', () => {
            const patterns = tmLanguageGrammar.patterns;
            const railsPatternIndex = patterns.findIndex((p: any) => p.name === 'rails.http.request.url');
            
            assert.ok(railsPatternIndex >= 0, 'Rails pattern should exist in grammar');
            
            // Should be positioned after file link patterns but before fallback patterns
            const filePatternIndex = patterns.findIndex((p: any) => p.name === 'file.link.with.line.number');
            const fallbackPatternIndex = patterns.findIndex((p: any) => p.name === 'ansi.fallback.bracket.sequence');
            
            assert.ok(railsPatternIndex > filePatternIndex, 'Rails pattern should come after file link patterns');
            assert.ok(railsPatternIndex < fallbackPatternIndex, 'Rails pattern should come before fallback patterns');
        });
    });

    suite('Color Theme Integration', () => {
        test('string.regexp scope should be defined in color theme', () => {
            // This test verifies that the string.regexp scope we're using
            // has a color definition in the attached theme
            
            // The theme in the attachment shows:
            // "scope": "string.regexp",
            // "settings": {
            //     "foreground": "#D16969"
            // }
            
            // We can't directly test the theme file, but we can verify
            // that our pattern uses the correct scope name
            const grammarPath = path.join(__dirname, '../../syntaxes/ansi-colors.tmLanguage.json');
            const grammarContent = fs.readFileSync(grammarPath, 'utf8');
            const tmLanguageGrammar = JSON.parse(grammarContent);
            
            const railsPattern = tmLanguageGrammar.patterns.find((p: any) => p.name === 'rails.http.request.url');
            assert.strictEqual(railsPattern.captures['2'].name, 'string.regexp', 'Should use string.regexp scope for URL highlighting');
        });

        test('keyword.control.ansi scope should be used for HTTP methods', () => {
            const grammarPath = path.join(__dirname, '../../syntaxes/ansi-colors.tmLanguage.json');
            const grammarContent = fs.readFileSync(grammarPath, 'utf8');
            const tmLanguageGrammar = JSON.parse(grammarContent);
            
            const railsPattern = tmLanguageGrammar.patterns.find((p: any) => p.name === 'rails.http.request.url');
            assert.strictEqual(railsPattern.captures['1'].name, 'keyword.control.ansi', 'Should use keyword.control.ansi scope for HTTP method highlighting');
        });
    });

    suite('Real-world Rails Log Examples', () => {
        test('should match actual Rails log output', () => {
            const pattern = /^Started\s+(GET|POST|DELETE|PATCH|PUT|HEAD|OPTIONS)\s+("[^"]+")/;
            
            // Test with the quoted format as specified in the requirements
            const quotedLogLines = [
                'Started GET "/" for ::1 at 2025-01-15 10:30:45 -0800',
                'Started POST "/users" for 127.0.0.1 at 2025-01-15 10:31:22 -0800',
                'Started PATCH "/users/42" for 10.0.0.1 at 2025-01-15 10:33:15 -0800'
            ];

            quotedLogLines.forEach(line => {
                const match = line.match(pattern);
                assert.ok(match, `Should match real Rails log line: ${line}`);
            });
        });
    });
});
