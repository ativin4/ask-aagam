import { openDB } from 'idb';

const DB_NAME = 'BookDatabase';
const STORE_NAME = 'books';

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
export const saveBookOffline = async (book: { id: string, title: string, fileBlob: Blob }) => {
  const db = await initDB();
  await db.put(STORE_NAME, book);
};

export const getBookOffline = async (id: string) => {
  const db = await initDB();
  return db.get(STORE_NAME, id);
};

export const deleteBookOffline = async (id: string) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const getOfflineBookIds = async () => {
  const db = await initDB();
  return db.getAllKeys(STORE_NAME);
};