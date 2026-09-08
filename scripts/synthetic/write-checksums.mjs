#!/usr/bin/env node
import { writeChecksums } from './lib.mjs';

const files = writeChecksums();
console.log(JSON.stringify({ ok: true, updated: files.length, files }, null, 2));
