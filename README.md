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
  ]
}
```

### Settings
- `rubyToolkit.automaticallyShowOutputForCommand`: Auto-show output (default: `true`)
- `rubyToolkit.clearOutputChannelOnProcessRun`: Clear output on restart (default: `true`)
- `rubyToolkit.showProcessOutputOnServer500Errors`: Show output on 500 errors (default: `true`)

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
