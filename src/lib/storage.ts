import { parseBoard, type BoardFile } from '../shared/board';

const DB_NAME = 'beebo-local';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('boards');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error('Local storage is unavailable. Export a board file instead.'),
      );
  });
}
export async function saveLocal(board: BoardFile) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite');
      tx.objectStore('boards').put(JSON.stringify(board), 'personal');
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            'Could not save on this device. Export a board file instead.',
          ),
        );
      tx.onabort = () => reject(new Error('Local saving was interrupted.'));
    });
  } finally {
    db.close();
  }
}
export async function loadLocal(): Promise<BoardFile | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('boards')
        .objectStore('boards')
        .get('personal');
      request.onsuccess = () => {
        try {
          resolve(
            typeof request.result === 'string'
              ? parseBoard(request.result)
              : null,
          );
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(new Error('Could not read the saved board.'));
    });
  } finally {
    db.close();
  }
}
export async function forgetLocal() {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite');
      tx.objectStore('boards').delete('personal');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Could not remove the saved board.'));
    });
  } finally {
    db.close();
  }
}
