// Simple test to verify the user-based directory functionality
const path = require('path');

// Mock VS Code extension context
const mockContext = {
    globalStorageUri: {
        fsPath: '/Users/testuser/.vscode/extensions/ruby-rails-toolkit/storage'
    }
};

// Mock the ProcessTracker behavior
function getPidDir(context) {
    if (context?.globalStorageUri) {
        return path.join(context.globalStorageUri.fsPath, 'pids');
    }
    return path.join(require('os').tmpdir(), 'ruby-rails-toolkit', 'pids');
}

console.log('User-based PID directory:', getPidDir(mockContext));
console.log('Fallback PID directory:', getPidDir(null));
