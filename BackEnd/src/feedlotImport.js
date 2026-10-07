'use strict';
// One-time load of the feedlot list from the spreadsheet (feedlot_finder_complete.csv).
//
//   node src/feedlotImport.js <file.csv>                       checks the file and, if the database
//                                                              is set up, rehearses the load and
//                                                              undoes it - nothing is saved
//   node src/feedlotImport.js <file.csv> --commit --user <id>  saves it; <id> is the staff account
//                                                              the new feedlots are recorded under
//
// A yard that is already in the list (same name, city and state) is skipped, so running it twice
// is safe. A row with something wrong in it is left out and listed so it can be fixed by hand.
const fs = require('fs');
const { validateFeedlot, clean } = require('./feedlotFields');

// Reads comma separated text where fields may be in double quotes ("" is a quote inside one).
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// The spreadsheet sometimes has a fax number written into the phone cell ("fax: (806) 668-4744").
// That part moves to the fax field.
function splitPhone(raw) {
  const text = clean(raw || '') || '';
  if (!text) return { phone: null, fax: null };
  const phones = [];
  const faxes = [];
  for (const part of text.split(';')) {
    const m = /^\s*fax\s*:?\s*(.*)$/i.exec(part);
    if (m) {
      if (m[1].trim()) faxes.push(m[1].trim());
    } else if (part.trim()) {
      phones.push(part.trim());
    }
  }
  return { phone: phones.length ? phones.join('; ') : null, fax: faxes.length ? faxes[0] : null };
}

// One spreadsheet row (an object keyed by the header names) -> tidied portal fields.
function rowToFeedlot(r) {
  const { phone, fax } = splitPhone(r['Phone']);
  return {
    name: r['Feedlot Name'],
    contactName: r['Contact'],
    address: r['Address'],
    city: r['City'],
    state: r['State'],
    zip: r['Zip'],
    phone,
    emails: r['Email'],
    fax,
    // A cell with two websites keeps the first.
    website: String(r['Website'] || '').split(';')[0],
  };
}

const REQUIRED_HEADERS = ['Feedlot Name', 'Contact', 'Address', 'City', 'State', 'Zip', 'Phone', 'Email', 'Website'];

// Returns { feedlots: [portal fields], problems: [{ line, name, messages }], total }.
function readFeedlots(text) {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error('The file is empty.');
  const header = table[0].map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) throw new Error('These columns are missing from the file: ' + missing.join(', '));
  const feedlots = [];
  const problems = [];
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2; // line number in the spreadsheet (1 is the header)
    const rec = {};
    header.forEach((h, c) => {
      rec[h] = cells[c] == null ? '' : cells[c];
    });
    const { values, errors } = validateFeedlot(rowToFeedlot(rec), { partial: false });
    if (errors) {
      problems.push({ line, name: (rec['Feedlot Name'] || '').trim(), messages: Object.entries(errors).map(([k, m]) => `${k}: ${m}`) });
    } else {
      feedlots.push(values);
    }
  });
  return { feedlots, problems, total: table.length - 1 };
}

function summarize(feedlots) {
  const withEmail = feedlots.filter((f) => f.emails && f.emails.length > 0);
  return {
    feedlots: feedlots.length,
    withEmail: withEmail.length,
    emailAddresses: withEmail.reduce((n, f) => n + f.emails.length, 0),
    withFax: feedlots.filter((f) => f.fax).length,
    states: new Set(feedlots.map((f) => f.state)).size,
  };
}

// Runs the load. repo = the feedlots repo; dryRun rehearses it and undoes it.
async function runImport({ text, repo, userId, dryRun }) {
  const { feedlots, problems, total } = readFeedlots(text);
  const result = await repo.bulkInsert(feedlots, userId, { dryRun });
  return { total, problems, summary: summarize(feedlots), ...result, dryRun };
}

module.exports = { parseCsv, splitPhone, rowToFeedlot, readFeedlots, summarize, runImport };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const positional = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--user') i += 1;
      else if (!args[i].startsWith('--')) positional.push(args[i]);
    }
    const file = positional[0];
    const commit = args.includes('--commit');
    const userIdx = args.indexOf('--user');
    const userId = userIdx >= 0 ? Number(args[userIdx + 1]) : NaN;
    if (!file) {
      console.error('Usage: node src/feedlotImport.js <file.csv> [--commit --user <staff id>]');
      process.exit(1);
    }
    const text = fs.readFileSync(file, 'utf8');
    const read = readFeedlots(text);
    console.log(`Rows in the file: ${read.total}`);
    console.log(`Ready to load:    ${read.feedlots.length}`);
    const s = summarize(read.feedlots);
    console.log(`  with email: ${s.withEmail} feedlots (${s.emailAddresses} addresses), with fax: ${s.withFax}, states: ${s.states}`);
    if (read.problems.length) {
      console.log(`Left out because of a problem: ${read.problems.length}`);
      for (const p of read.problems) console.log(`  line ${p.line} (${p.name || 'no name'}): ${p.messages.join('; ')}`);
    }

    const config = require('./config');
    if (!config.databaseUrl) {
      console.log('DATABASE_URL is not set, so only the file was checked. Nothing was saved.');
      return;
    }
    if (commit && !(userId > 0)) {
      console.error('To save, add --user <id> with the id of the staff account (for example --user 2).');
      process.exit(1);
    }
    const db = require('./db');
    const { createFeedlotsRepo } = require('./feedlots');
    try {
      if (commit) {
        const u = (await db.query('SELECT id, role, display_name FROM users WHERE id = $1', [userId])).rows[0];
        if (!u || u.role !== 'staff') {
          console.error(`User ${userId} was not found or is not a staff account. Nothing was saved.`);
          process.exit(1);
        }
      }
      const repo = createFeedlotsRepo(db);
      const anyUser = commit ? userId : (await db.query("SELECT id FROM users ORDER BY (role = 'staff') DESC, id LIMIT 1")).rows[0];
      const uid = commit ? userId : anyUser && anyUser.id;
      if (!uid) {
        console.error('There is no user in the database yet, so the load cannot be rehearsed.');
        process.exit(1);
      }
      const r = await repo.bulkInsert(read.feedlots, uid, { dryRun: !commit });
      console.log(commit ? `SAVED: ${r.inserted} feedlots added, ${r.skipped} already there.` : `REHEARSAL ONLY (nothing saved): ${r.inserted} would be added, ${r.skipped} already there.`);
      if (!commit) console.log('To save for real, run it again with --commit --user <staff id>.');
    } finally {
      await db.close();
    }
  })().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
