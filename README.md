# OpenCode Damage Control Plugin

Security plugin that blocks dangerous commands and protects sensitive files.

Inspired by: https://github.com/disler/claude-code-damage-control

## Installation

### Direct Install

```bash
open your opencode config
~/.config/opencode/opencode.jsonc 

Then add to the 'plugin' section

"plugin": ["@bneil/opencode-damage-control"],

```

Then restart OpenCode.

## What It Protects

### Bash Commands

Blocks dangerous shell operations:
- `rm -rf`, `rm -f`, `sudo rm`
- `git reset --hard`, `git push --force`, `git clean -fd`
- AWS/GCP/Azure destructive operations
- Docker/Kubernetes destructive operations
- Database drops and truncates
- And 350+ more patterns

### Zero-Access Paths (blocked for ALL operations)

Sensitive files that should never be accessed:
- `.env`, `.env.*`, `*.env`
- `~/.ssh/`, `~/.gnupg/`
- `~/.aws/`, `~/.config/gcloud/`, `~/.azure/`
- `*.pem`, `*.key`, `*.tfstate`
- And more...

### Read-Only Paths (read allowed, write/edit blocked)

Files that should not be modified:
- System directories: `/etc/`, `/usr/`, `/bin/`
- Lock files: `package-lock.json`, `yarn.lock`, `*.lock`
- Build artifacts: `dist/`, `node_modules/`, `.next/`
- Shell configs: `~/.bashrc`, `~/.zshrc`

### No-Delete Paths (read/write allowed, delete blocked)

Important files protected from deletion:
- `LICENSE`, `README.md`, `CHANGELOG.md`
- `.git/`, `.github/`
- `Dockerfile`, `docker-compose.yml`

## Customization

Edit `patterns.yaml` to add or remove patterns:

```yaml
# Add a new dangerous command pattern
bashToolPatterns:
  - pattern: '\bmy-dangerous-cmd\b'
    reason: Custom dangerous command

# Add a new zero-access path
zeroAccessPaths:
  - "~/.my-secrets/"

# Add a new read-only path
readOnlyPaths:
  - "important-config.json"
```

## File Structure

```
opencode-damage-control/
├── index.ts              # Main plugin entry point
├── package.json          # Dependencies (yaml, @opencode-ai/plugin)
├── tsconfig.json         # TypeScript config
├── patterns.yaml         # Security patterns (edit this!)
├── matchers/
│   ├── patterns.ts       # Glob/regex utilities, config loading
│   ├── bash.ts           # Shell command checker
│   └── file.ts           # File path checker
└── README.md
```

## Differences from Claude Code Version

| Claude Code | OpenCode |
|-------------|----------|
| 3 separate hooks for bash/edit/write | Single plugin handles all tools |
| Exit codes (0=allow, 2=block) | `throw new Error()` to block |
| `ask` patterns prompt for confirmation | `ask` patterns are blocked (stricter) |

Handles OpenCode tools: `bash`, `read`, `write`, `edit`, `patch`, `glob`, `grep`, `list`

## Testing

After installation, try these in OpenCode (they should be blocked):
<img width="1199" height="196" alt="Screenshot 2026-01-21 at 5 06 26 PM" src="https://github.com/user-attachments/assets/a8b24ee0-1da9-4d45-850c-f9a29ca63e80" />

```bash
echo "test" > package-lock.json

// scarier, but should be covered
rm -rf /
cat ~/.ssh/id_rsa

```

## Notes

The exact OpenCode plugin API (property names like `output.args.filePath` vs `output.args.file_path`) may need adjustment once tested against the actual OpenCode runtime. Fallbacks are included to handle common variations.
