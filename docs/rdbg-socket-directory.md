# RDBG Socket Directory Configuration

This extension now supports configuring whether to use a custom RDBG socket directory for debugging sessions.

## Configuration Setting

**Setting**: `rubyToolkit.useCustomRdbgSocketDirectory`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Use custom RDBG socket directory (/tmp/rdbg-socks) for debugging sessions. When disabled, uses the default rdbg socket location.

## How it Works

When this setting is **enabled** (default):
- The extension sets the `RUBY_DEBUG_SOCK_DIR=/tmp/rdbg-socks` environment variable when launching rdbg commands
- This creates a centralized location for all debugging socket files
- Enables better socket management and cleanup

When this setting is **disabled**:
- The extension does not set the `RUBY_DEBUG_SOCK_DIR` environment variable
- rdbg uses its default socket location (typically in /tmp with random names)
- Socket cleanup is handled by rdbg itself

## Usage

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "rdbg socket"
3. Toggle the "Use Custom Rdbg Socket Directory" setting

## Technical Details

The setting affects the following debugging commands:
- RSpec debugging (`rspec-runner.debugRubySpec`)
- App command debugging (`appRunner.debug`)
- Any rdbg session launched through the extension

## Files Modified

- `package.json` - Added the configuration setting
- `src/rdbgSockets.ts` - Added `getRdbgSocketDirEnvPrefix()` helper function
- `src/appCommand.ts` - Updated `buildRdbgCommand()` to use the setting
- `src/rspecRunner.ts` - Updated rdbg command construction to use the setting
- Tests updated to cover the new functionality
