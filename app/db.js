/* LifeManager — built-in single-table storage (IndexedDB, one object store "records") */
'use strict';
const DB = (() => {
  const NAME = 'lifemanager', VERSION = 1, STORE = 'records';
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('type', 'type');
          s.createIndex('date', 'date');
          s.createIndex('groupId', 'groupId');
          s.createIndex('parentId', 'parentId');
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbPromise;
  }

  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let out;
      Promise.resolve(fn(t.objectStore(STORE))).then(v => { out = v; }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  return {
    all: () => run('readonly', s => req(s.getAll())),
    get: id => run('readonly', s => req(s.get(id))),
    byType: type => run('readonly', s => req(s.index('type').getAll(type))),
    put: rec => run('readwrite', s => req(s.put(rec))),
    del: id => run('readwrite', s => req(s.delete(id))),
    delMany: ids => run('readwrite', s => Promise.all(ids.map(id => req(s.delete(id))))),
    putMany: recs => run('readwrite', s => Promise.all(recs.map(r => req(s.put(r))))),
    clear: () => run('readwrite', s => req(s.clear())),
    replaceAll: recs => run('readwrite', s => req(s.clear()).then(() => Promise.all(recs.map(r => req(s.put(r))))))
  };
})();
