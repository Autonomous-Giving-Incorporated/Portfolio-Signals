import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { emptyState } from '../domain/pots.mjs';
import {
  createMemoryStore,
  deserializeState,
  ensureExtras,
  serializeState,
} from './store-core.mjs';

export {
  createMemoryStore,
  deserializeState,
  ensureExtras,
  serializeState,
};

export function createFileStore(filePath) {
  let cache = null;
  return {
    async load() {
      if (cache) return cache;
      try {
        const raw = JSON.parse(await readFile(filePath, 'utf8'));
        cache = deserializeState(raw);
      } catch (error) {
        if (error?.code === 'ENOENT') cache = ensureExtras(emptyState());
        else throw new Error('STATE_LOAD_FAILED', { cause: error });
      }
      return cache;
    },
    async save(next) {
      const prepared = ensureExtras(next);
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFile(temporaryPath, JSON.stringify(serializeState(prepared), null, 2), { flag: 'wx' });
        await rename(temporaryPath, filePath);
        cache = prepared;
      } finally {
        await unlink(temporaryPath).catch(() => {});
      }
    },
  };
}
