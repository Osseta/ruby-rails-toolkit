# Ruby & Rails Development Toolkit

A comprehensive VS Code extension for Ruby and Rails development that provides seamless testing, application debugging, and Rails server management. This toolkit combines powerful testing capabilities with an intuitive application runner for efficient Rails development workflows.

## ✨ Features

### 🧪 **RSpec Testing & Debugging**
- **CodeLens Integration**: Run and debug individual RSpec blocks with one-click buttons that appear directly above your test code
- **Smart Test Execution**: Run entire spec files or target specific test blocks with line-level precision
- **Advanced Debugging**: Full debugger integration using Ruby's `rdbg` for stepping through tests and application code
- **Headless Testing**: Fast headless test execution for quick feedback during development

### 🚀 **Application Runner & Management**
- **Rails Server Control**: Start, stop, and monitor your Rails web server from a dedicated sidebar panel
- **Background Jobs**: Manage Rails job workers (Sidekiq, delayed_job, etc.) with full process control
- **Custom Commands**: Configure and run any Ruby or shell commands through the App Runner interface
- **Process Monitoring**: Real-time status indicators showing running, stopped, or crashed processes
- **Output Channels**: Dedicated output windows for each process with clickable file paths and error linking

### 🔧 **Developer Experience**
- **Smart Process Tracking**: Automatic detection of crashed processes with clear visual indicators
- **Interactive Controls**: Context-sensitive buttons and quick-pick menus for common operations
- **Configuration Management**: JSON-based configuration for custom application commands
- **Error Handling**: Robust error detection with automatic output display for 500 errors

## 📋 Requirements

- Ruby project with RSpec testing framework
- Bundler for dependency management
- VS Code 1.63.0 or higher
- Optional: `rdbg` gem for advanced debugging features

## 🚀 Quick Start

### RSpec Testing
1. Open any `*_spec.rb` file in your Ruby project
2. Look for the **Run** and **Debug** buttons that appear above your test blocks
3. Click **Run** for fast headless execution or **Debug** to step through with the debugger
4. Use the title bar **Debug** button to run/debug the entire spec file

### Application Runner
1. Open the **App Runner** panel from the Activity Bar (left sidebar)
2. The extension auto-configures common Rails commands:
   - **Web Server**: `bundle exec rails s`
   - **Jobs Worker**: `bundle exec rake jobs:work`
3. Click the **Run** button next to any command to start it
4. Use the **Stop**, **Debug**, or **Show Output** buttons to manage running processes

## ⚙️ Configuration

### Custom App Commands
Create `.vscode/app_commands.json` in your project root to define custom commands:

```json
{
  "commands": [
    {
      "code": "RAILS",
      "description": "Web Server",
      "command": "bundle exec rails s",
      "commandType": "ruby",
      "wait": false
    },
    {
      "code": "JOBS",
      "description": "Jobs Worker", 
      "command": "bundle exec rake jobs:work",
      "commandType": "ruby",
      "wait": false
    },
    {
      "code": "WEBPACKER",
      "description": "Webpacker", 
      "command": "yarn dev",
      "commandType": "shell",
      "wait": false
    },
  ]
}
```

### Extension Settings
- `runRspec.automaticallyShowOutputForCommand`: Automatically display output when commands are run (default: `true`)
- `runRspec.showProcessOutputOnServer500Errors`: Show process output when 500 errors are detected (default: `true`)

## 🎯 Usage Examples

### Running Tests
```ruby
# In your spec file, click the buttons that appear above:
describe User do
  it "creates a valid user" do    # ← Run/Debug buttons appear here
    user = User.new(name: "Test")
    expect(user).to be_valid
  end

  context "with invalid data" do  # ← Run/Debug buttons appear here
    # More tests...
  end
end
```

### Managing Applications
- **Start Rails Server**: Click ▶️ next to "Web Server" in App Runner
- **Debug Running Process**: Click 🔍 next to any running Ruby process to attach debugger
- **View Logs**: Click 📄 to open dedicated output channel for any process
- **Stop All**: Use the stop-all button in the App Runner toolbar

## 🔍 Debugging Features

The extension provides sophisticated debugging capabilities:

- **RSpec Debugging**: Attach debugger to specific test blocks or entire spec files
- **Application Debugging**: Debug running Rails servers, job workers, or console sessions
- **Socket Management**: Automatic `rdbg` socket discovery and connection
- **Multi-Process**: Debug multiple Ruby processes simultaneously

## 🛠️ Process Management

### Visual Status Indicators
- 🟢 **Green Circle**: Process running normally
- 🔴 **Red Error Icon**: Process crashed or failed
- ⚪ **Gray Circle**: Process stopped or not running

### Smart Controls
- **Run**: Start stopped processes
- **Stop**: Terminate running processes  
- **Debug**: Attach debugger to running Ruby processes
- **Show Output**: View process logs and output
- **Quick Actions**: Right-click any process for context menu

## 🐛 Troubleshooting

### Common Issues
- **No CodeLens buttons**: Ensure file ends with `_spec.rb` and contains valid RSpec syntax
- **Debug not working**: Install `rdbg` gem (`gem install debug`) and ensure it's in your Gemfile
- **Process not stopping**: Check App Runner for crashed processes and use "Show Output" to view errors

### File Path Integration
The extension automatically converts file paths in output to clickable VS Code links, making it easy to navigate to errors and stack traces.

## 📄 License

This extension is licensed under the [MIT License](LICENSE).

---

**Happy Rails Development! 🚂✨**
