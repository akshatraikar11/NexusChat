import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { io as Client } from 'socket.io-client';

let serverProc;
const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}`;

function waitForReady(proc, match) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (data) => {
      buf += data.toString();
      if (buf.includes(match)) {
        cleanup();
        resolve();
      }
    };
    const onErr = (data) => {
      buf += data.toString();
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`server exited with code ${code}\n${buf}`));
    };
    const cleanup = () => {
      proc.stdout.off('data', onData);
      proc.stderr.off('data', onErr);
      proc.off('exit', onExit);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onErr);
    proc.on('exit', onExit);
  });
}

before(async () => {
  serverProc = spawn('node', ['backend/server-completed.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForReady(serverProc, `listening on http://localhost:${PORT}`);
});

after(() => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
  }
});

test('client connects, posts message, receives updated history', async () => {
  const client = Client(BASE_URL, { transports: ['websocket'] });
  let initialReceived = false;
  let updatedReceived = false;

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
    client.on('connect', () => {});

    client.on('receive-messages', (data) => {
      const { chatHistory, username } = data || {};
      if (!initialReceived) {
        initialReceived = true;
        // post a message after initial history arrives
        client.emit('post-message', { message: 'Hello test!' });
      } else if (!updatedReceived) {
        updatedReceived = true;
        const hasHello = Array.isArray(chatHistory) && chatHistory.some(m => m.message === 'Hello test!');
        const hasTimestamp = Array.isArray(chatHistory) && chatHistory.some(m => typeof m.createdAt === 'string');
        clearTimeout(timeout);
        resolve({ hasHello, hasTimestamp, username });
        client.close();
      }
    });
    client.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  assert.equal(result.hasHello, true, 'posted message should appear in history');
  assert.equal(result.hasTimestamp, true, 'messages should include createdAt');
});