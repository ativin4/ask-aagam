import { openDB } from 'idb';

const DB_NAME = 'ScriptureDatabase';
const STORE_NAME = 'scriptures';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

// Now accepts a Blob instead of a string
export const saveScriptureOffline = async (scripture: { id: string, title: string, fileBlob: Blob }) => {
  const db = await initDB();
  await db.put(STORE_NAME, scripture);
};

export const getScriptureOffline = async (id: string) => {
  const db = await initDB();
  return db.get(STORE_NAME, id);
};

export const deleteScriptureOffline = async (id: string) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const getOfflineScriptureIds = async () => {
  const db = await initDB();
  return db.getAllKeys(STORE_NAME);
};