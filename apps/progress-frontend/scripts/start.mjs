import { execSync } from 'node:child_process';

const port = process.env.PORT || '3000';
const host = process.env.HOST || '0.0.0.0';
const serveCmd = `npx serve dist -s -l tcp://${host}:${port}`;

execSync(serveCmd, { stdio: 'inherit' });
