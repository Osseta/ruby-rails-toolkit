const vscode = {
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: '/mock/workspace' }
        }]
    }
};

function preprocessOutputData(data) {
    const lines = data.split('\n');
    const processedLines = lines.map((line, index) => {
        if (index === lines.length - 1 && line === '') {
            return line;
        }
        
        const filePathPattern = /(?:^|\s|"|')((?:\/)?(?:[a-zA-Z_][a-zA-Z0-9_-]*\/)*[a-zA-Z_][a-zA-Z0-9_.-]*\.[a-zA-Z0-9]+(?::\d+(?::[^\s"']*)?)?)/g;
        
        let processedLine = line;
        
        if (!line.includes('file://')) {
            processedLine = line.replace(filePathPattern, (match, path) => {
                console.log('Found match:', match, 'Path:', path);
                
                if (path.includes('/') || path.startsWith('/') || /^[a-zA-Z_][a-zA-Z0-9_.-]*\.[a-zA-Z0-9]+/.test(path)) {
                    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    
                    const lineNumberWithExtraMatch = path.match(/^(.+\.[a-zA-Z0-9]+:\d+)(:.+)$/);
                    if (lineNumberWithExtraMatch) {
                        const pathWithLineNumber = lineNumberWithExtraMatch[1];
                        const extraText = lineNumberWithExtraMatch[2];
                        
                        if (pathWithLineNumber.startsWith('/')) {
                            return match.replace(path, `file://${pathWithLineNumber} ${extraText}`);
                        } else {
                            return match.replace(path, `file://${workspaceDir}/${pathWithLineNumber} ${extraText}`);
                        }
                    } else {
                        if (path.startsWith('/')) {
                            return match.replace(path, `file://${path}`);
                        } else {
                            return match.replace(path, `file://${workspaceDir}/${path}`);
                        }
                    }
                }
                return match;
            });
        }
        
        return processedLine;
    });
    
    return processedLines.join('\n');
}

// Test the specific failing case
console.log('Testing: package.json:50');
const result = preprocessOutputData('package.json:50');
console.log('Result:', result);
console.log('Expected: file:///mock/workspace/package.json:50');
