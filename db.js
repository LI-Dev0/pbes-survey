const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'submissions.json');

function ensureFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '[]', 'utf8');
  }
}

function init() {
  ensureFile();

  function readAll() {
    ensureFile();
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeAll(arr) {
    fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf8');
  }

  return {
    addSubmission(payload, category, cb) {
      try {
        const all = readAll();
        const id = (all.length ? all[all.length - 1].id + 1 : 1);
        const record = { id, timestamp: Date.now(), category: category || 'uncategorized', payload };
        all.push(record);
        writeAll(all);
        cb(null, id);
      } catch (err) {
        cb(err);
      }
    },
    getSubmissions(cb) {
      try {
        const all = readAll().slice().reverse();
        cb(null, all);
      } catch (err) {
        cb(err);
      }
    },
    getStats(cb) {
      try {
        const all = readAll();
        const counts = {};
        all.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
        cb(null, counts);
      } catch (err) {
        cb(err);
      }
    }
  };
}

module.exports = { init };
