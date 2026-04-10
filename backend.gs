// =========================
// CONFIG
// =========================
const SHEETS = {
  instagram: 'IG',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  x: 'X'
};

const BATCH_SIZE = 50;

// =========================
// WEBHOOK ENTRY
// =========================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const links = body.links || [];

    if (!Array.isArray(links) || links.length === 0) {
      throw new Error('Links kosong atau format salah');
    }

    const result = processBulkLinks(links);

    return jsonResponse({
      status: 'success',
      ...result
    });

  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.message
    });
  }
}

// =========================
// BULK PROCESSOR
// =========================
function processBulkLinks(links) {
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;

  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    const batch = links.slice(i, i + BATCH_SIZE);

    const res = processLinks(batch);

    inserted += res.inserted;
    duplicates += res.duplicates;
    skipped += res.skipped;

    Utilities.sleep(100); // anti limit
  }

  return { inserted, duplicates, skipped };
}

// =========================
// CORE LOGIC
// =========================
function processLinks(links) {
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;

  const sheetCache = {};
  const existingCache = {};

  links.forEach(link => {
    if (!link) return;

    const cleanLink = link.trim();
    const platform = detectPlatform(cleanLink);

    if (!platform) {
      skipped++;
      return;
    }

    const username = extractUsername(cleanLink, platform);

    if (!username) {
      skipped++;
      return;
    }

    // cache sheet biar gak dipanggil terus
    if (!sheetCache[platform]) {
      sheetCache[platform] = getSheet(platform);
      existingCache[platform] = getExistingData(sheetCache[platform]);
    }

    const sheet = sheetCache[platform];
    const existing = existingCache[platform];

    const key = username + '|' + cleanLink;

    if (existing.has(key)) {
      duplicates++;
      return;
    }

    sheet.appendRow([username, cleanLink]);
    existing.add(key);

    inserted++;
  });

  return { inserted, duplicates, skipped };
}

// =========================
// PLATFORM DETECTOR
// =========================
function detectPlatform(url) {
  const u = url.toLowerCase();

  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x';

  return null;
}

// =========================
// USERNAME PARSER (FIXED)
// =========================
function extractUsername(url, platform) {
  try {
    // hapus query & trailing slash (FIXED REGEX)
    url = url.split('?')[0].replace(/\/+$/, '').trim();

    const parts = url.split('/');

    switch (platform) {
      case 'instagram':
        return parts[3] || '';

      case 'tiktok':
        return (parts[3] || '').replace('@', '');

      case 'x':
        return parts[3] || '';

      case 'facebook':
        return parts[3] || '';

      default:
        return '';
    }
  } catch (e) {
    return '';
  }
}

// =========================
// SHEET HANDLER
// =========================
function getSheet(platform) {
  const name = SHEETS[platform];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);

  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + name);
  }

  return sheet;
}

// =========================
// FAST DUPLICATE CHECK
// =========================
function getExistingData(sheet) {
  const data = sheet.getDataRange().getValues();
  const set = new Set();

  for (let i = 1; i < data.length; i++) {
    const username = data[i][0];
    const link = data[i][1];

    if (username && link) {
      set.add(username + '|' + link);
    }
  }

  return set;
}

// =========================
// RESPONSE HELPER
// =========================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
