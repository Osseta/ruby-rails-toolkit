# Ruby & Rails Developer Toolkit

A powerful VS Code extension for Ruby and Rails development featuring one-click testing, debugging, and process management. Streamline your Rails workflow with intelligent test runners and application controls.

## ✨ Key Features

### 🧪 **RSpec Testing**
- **One-Click Testing**: Run/Debug buttons appear above each test block
- **Smart Execution**: Target specific tests or entire spec files
- **Integrated Debugging**: Full `rdbg` debugger support with breakpoints
- **Run & Debug**: New combined action that runs tests and automatically starts debugging

### 🚀 **Application Management**
- **Process Control**: Start, stop, and monitor Rails servers and background jobs
- **Smart Debugging**: Attach debugger to running Ruby processes
- **Custom Commands**: Configure any Ruby/shell commands via JSON
- **Real-time Status**: Visual indicators for running/stopped/crashed processes

### ⚙️ **Feature Management**
- **Environment Configuration**: Toggle feature flags with checkbox controls
- **Smart Environment Variables**: Enable/disable environment variable groups per feature
- **Real-time Updates**: Changes take effect immediately for new processes
- **Persistent State**: Feature states saved across VS Code sessions

## 🚀 Quick Start

### Testing with RSpec
1. Open any `*_spec.rb` file
2. Click **Run** for fast execution or **Debug** to step through code
3. Use **Run & Debug** from the dropdown menu for automatic debugging
4. Title bar buttons work on entire spec files

### Application Runner  
1. Open **App Runner** panel from sidebar
2. Start Rails server: Click ▶️ next to "Web Server"
3. Debug running processes: Click 🔍 next to any Ruby process
4. View logs: Click 📄 for dedicated output channels

### Feature Management
1. Open **Features** panel from sidebar (below App Runner)
2. Enable/disable features: Click checkboxes to toggle feature states
3. View feature details: Hover over items to see environment variable configurations
4. Persistent settings: Feature states are automatically saved and restored

## ⚙️ Configuration

### App Commands
Create `.vscode/app_commands.jsonc` for custom commands:

```jsonc
{
  // App Runner configuration for VS Code Ruby & Rails Toolkit
  "commands": [
    {
      "code": "RAILS",
      "description": "Web Server",
      "command": "bundle exec rails s",
      "commandType": "ruby"
    },
    {
      "code": "JOBS", 
      "description": "Jobs Worker",
      "command": "bundle exec rake jobs:work",
      "commandType": "ruby"
    },
    {
      "code": "WEBPACKER",
      "description": "Webpacker", 
      "command": "yarn dev",
      "commandType": "shell"
    }
  ],
  "features": [
    {
      "code": "DEBUG",
      "name": "Debug Mode",
      "description": "Enables debugging and verbose logging",
      "environment": {
        "whitelist": ["DEBUG=true", "VERBOSE=1", "LOG_LEVEL=debug"],
      }
    },
    {
      "code": "PERFORMANCE",
      "name": "Performance Monitoring", 
      "description": "Enables performance profiling and benchmarks",
      "environment": {
        "whitelist": ["PROFILE=true", "BENCHMARK=1"],
      }
    }
  ]
}
```

### Features Configuration
The `features` array defines toggleable feature flags that control environment variables:

- **`code`**: Unique identifier for the feature
- **`name`**: Display name shown in the Features panel
- **`description`**: Tooltip description explaining the feature's purpose  
- **`environment.whitelist`**: Environment variables set when feature is enabled

When a feature is enabled via checkbox, its whitelist environment variables are applied to new processes. When disabled, blacklist variables are applied instead.

### Settings
- `rubyToolkit.automaticallyShowOutputForCommand`: Auto-show output (default: `true`)
- `rubyToolkit.clearOutputChannelOnProcessRun`: Clear output on restart (default: `true`)
- `rubyToolkit.showProcessOutputOnServer500Errors`: Show output on 500 errors (default: `true`)
- `rubyToolkit.hideAnsiPunctuation`: Hide ANSI escape code punctuation and control characters in log output (default: `true`)

## 🎯 Key Actions

### Test Controls
- **Run**: Fast headless test execution
- **Debug**: Step-through debugging with breakpoints  

### Process Controls  
- **▶️ Run**: Start stopped processes
- **▶️ Run & Debug**: Start stopped processes and immediately start debugging
- **⏹️ Stop**: Terminate running processes
- **🔍 Debug**: Attach debugger to running Ruby processes  
- **📄 Show Output**: View process logs with clickable file paths

### Feature Controls
- **☑️ Enable/Disable**: Check/uncheck boxes to toggle features
- **🔄 Refresh**: Update features list from configuration
- **ℹ️ Hover Info**: View environment variable details in tooltips

## 🐛 Troubleshooting

- **No rspec commands**: Ensure file ends with `_spec.rb` and contains valid RSpec syntax
- **Debug not working**: Add `debug` gem to your Gemfile

## 📋 Requirements

- Ruby project with RSpec
- Bundler for dependencies  
- VS Code 1.80.0+
- `debug` gem for debugging

---

**Happy Rails Development! 🚂✨**
