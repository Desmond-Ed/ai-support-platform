import { cpSync, rmSync } from 'node:fs';

rmSync('dist/generated', { recursive: true, force: true });
cpSync('src/generated', 'dist/generated', { recursive: true });
