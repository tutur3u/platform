const { execSync } = require('child_process');
const isWin = process.platform === 'win32';

const arg = process.argv[2];

if (!arg) {
  console.error('No command provided. Usage: node script.js <install|dev|start|run|serve|deploy>');
  process.exit(1);
}

const commands = {
  install: isWin
    ? 'python -m venv venv && venv\\Scripts\\pip install -r requirements.txt'
    : 'python -m venv venv && venv/bin/pip install -r requirements.txt',
  dev: isWin
    ? 'venv\\Scripts\\uvicorn main:app --host 127.0.0.1 --port 5500 --reload'
    : 'venv/bin/uvicorn main:app --host 127.0.0.1 --port 5500 --reload',
  start: isWin
    ? 'venv\\Scripts\\uvicorn main:app --host 127.0.0.1 --port 5500'
    : 'venv/bin/uvicorn main:app --host 127.0.0.1 --port 5500',
  run: isWin
    ? 'venv\\Scripts\\modal run modal_deployment.py'
    : 'venv/bin/modal run modal_deployment.py',
  serve: isWin
    ? 'venv\\Scripts\\modal serve modal_deployment.py'
    : 'venv/bin/modal serve modal_deployment.py',
  deploy: isWin
    ? 'venv\\Scripts\\modal deploy modal_deployment.py'
    : 'venv/bin/modal deploy modal_deployment.py',
};

const cmd = commands[arg];

if (!cmd) {
  console.error(`Unknown command: ${arg}`);
  process.exit(1);
}

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}