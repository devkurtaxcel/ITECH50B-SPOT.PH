const http = require('http');
const fs = require('fs');
const path = require('path');
const knowledge = require('./scripts/spot-knowledge.js');

const root = path.resolve(__dirname);
const port = Number(process.argv[2] || 4173);
const pollinationsUrl = 'https://gen.pollinations.ai/v1/chat/completions';
const gasSourceUrl = 'https://gaswatchph.com/js/data.js';
const gasSourceName = 'GasWatch PH';
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm'
};

const gasCache = {
  value: null,
  expiresAt: 0
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function readRequestBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', function(chunk) {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', function() {
      resolve(body);
    });
    req.on('error', reject);
  });
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/ÃƒÆ’Ã‚Â±/g, 'ñ')
    .replace(/ÃƒÆ’Ã¢â‚¬Ëœ/g, 'Ñ')
    .replace(/ÃƒÆ’Ã‚Â¡/g, 'á')
    .replace(/ÃƒÆ’Ã‚Â©/g, 'é')
    .replace(/ÃƒÆ’Ã‚Â­/g, 'í')
    .replace(/ÃƒÆ’Ã‚Â³/g, 'ó')
    .replace(/ÃƒÆ’Ã‚Âº/g, 'ú')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, '-')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â/g, '-')
    .replace(/ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±/g, '₱');
}

function titleCase(value) {
  return knowledge.titleCase(value);
}

function locationLabel(value) {
  return knowledge.locationLabels[value] || titleCase(value);
}

function passengerTypeLabel(value, language) {
  const type = String(value || 'regular').toLowerCase();
  if (type === 'pwd') return 'PWD';
  if (language === 'filipino' && type === 'student') return 'estudyante';
  return type;
}

function currentDriverRecords(context) {
  return Array.isArray(context && context.drivers) ? context.drivers : [];
}

function currentFleetSummary(context) {
  if (
    context &&
    context.fleet &&
    context.fleet.summary &&
    context.fleet.summary.totals &&
    context.fleet.summary.byType &&
    context.fleet.summary.byRoute
  ) {
    return context.fleet.summary;
  }

  const snapshot = knowledge.getFleetSnapshot({
    publishedDrivers: currentDriverRecords(context)
  });
  return knowledge.getFleetSummary(snapshot);
}

async function fetchGasSnapshot() {
  const now = Date.now();
  if (gasCache.value && gasCache.expiresAt > now) {
    return gasCache.value;
  }

  const response = await fetch(gasSourceUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load gas data');
  }

  const text = await response.text();
  const parsed = new Function(`${text}; return { LAST_UPDATED, PRICE_HISTORY, GAS_STATIONS, BRANDS };`)();
  const stations = Array.isArray(parsed.GAS_STATIONS) ? parsed.GAS_STATIONS : [];
  const brands = parsed.BRANDS || {};

  function buildFuelSummary(stationKey) {
    const values = stations
      .map(function(station) {
        return {
          station: sanitizeText(station.name),
          area: sanitizeText(station.area),
          brand: sanitizeText(brands[station.brand] ? brands[station.brand].name : station.brand),
          price: station.prices ? station.prices[stationKey] : null
        };
      })
      .filter(function(entry) {
        return typeof entry.price === 'number' && !Number.isNaN(entry.price);
      })
      .sort(function(a, b) {
        return a.price - b.price;
      });

    const average = values.length
      ? values.reduce(function(sum, entry) { return sum + entry.price; }, 0) / values.length
      : 0;

    return {
      stationsTracked: values.length,
      average,
      cheapest: values[0] || null,
      highest: values.length ? values[values.length - 1] : null,
      sample: values.slice(0, 8)
    };
  }

  const snapshot = {
    lastUpdated: sanitizeText(parsed.LAST_UPDATED),
    sourceName: gasSourceName,
    sourceUrl: gasSourceUrl,
    areas: Array.from(new Set(stations.map(function(station) {
      return sanitizeText(station.area);
    }).filter(Boolean))).sort(function(a, b) {
      return a.localeCompare(b);
    }),
    stations: stations.map(function(station) {
      return {
        station: sanitizeText(station.name),
        area: sanitizeText(station.area),
        brand: sanitizeText(brands[station.brand] ? brands[station.brand].name : station.brand),
        diesel: station.prices ? station.prices.diesel : null,
        unleaded: station.prices ? station.prices.unleaded : null
      };
    }),
    diesel: buildFuelSummary('diesel'),
    unleaded: buildFuelSummary('unleaded')
  };

  gasCache.value = snapshot;
  gasCache.expiresAt = now + (5 * 60 * 1000);
  return snapshot;
}

function formatCurrency(value) {
  return knowledge.formatCurrency(value);
}

function normalizeLookupText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeAnswer(route) {
  if (!route) {
    return `Available routes: ${knowledge.getRouteCatalog().map(function(item) {
      return item.shortLabel;
    }).join(', ')}.`;
  }

  const item = knowledge.getRouteCatalog().find(function(entry) {
    return entry.id === route;
  });

  if (!item) return 'That route is not in the current site data.';
  return `${item.label} runs from ${item.origin} to ${item.destination}. Vehicle types on this route: ${item.vehicleTypes.map(titleCase).join(', ')}.`;
}

function normalizedFareText(value) {
  return normalizeLookupText(value)
    .replace(/\bmag\s+kano\b/g, ' magkano ')
    .replace(/\bmag\s+kanu\b/g, ' magkano ')
    .replace(/\bmag\s+kno\b/g, ' magkano ')
    .replace(/\bmagkanu\b/g, ' magkano ')
    .replace(/\bmagkno\b/g, ' magkano ')
    .replace(/\bmgkno\b/g, ' magkano ')
    .replace(/\bmgkano\b/g, ' magkano ')
    .replace(/\bmagkano\b/g, ' magkano ')
    .replace(/\bmagknu\b/g, ' magkano ')
    .replace(/\bsestudyante\b/g, ' estudyante ')
    .replace(/\bestudiante\b/g, ' estudyante ')
    .replace(/\bestudyanti\b/g, ' estudyante ')
    .replace(/\bsenyor\b/g, ' senior ')
    .replace(/\bbyad\b/g, ' bayad ')
    .replace(/\bd2\b/g, ' dito ')
    .replace(/\bdito\b/g, ' ')
    .replace(/\b2\b/g, ' to ')
    .replace(/\bt\b/g, ' to ')
    .replace(/\bfrm\b/g, ' from ')
    .replace(/\bfr\b/g, ' from ')
    .replace(/\bgaling\b/g, ' from ')
    .replace(/\bpapunta(?:ng)?\b/g, ' to ')
    .replace(/\bpnta\b/g, ' to ')
    .replace(/\bpunta\b/g, ' to ')
    .replace(/\bhanggang\b/g, ' to ')
    .replace(/\bhnngang\b/g, ' to ')
    .replace(/\bsa\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFareQuestionLanguage(text) {
  const haystack = normalizedFareText(text);
  return /\b(fare|how much|price from|pamasahe|pmasahe|pamasahi|magkano|bayad|bayaran|bayran|singil)\b/.test(haystack);
}

function isOverrunFareQuestion(text) {
  const haystack = normalizedFareText(text);
  return /\b(lumagpas|lagpas|lampas|lalagpas|sumobra|sobra|exceed|beyond)\b/.test(haystack);
}

function isFareSourceQuestion(text) {
  const haystack = normalizeLookupText(text);
  const asksSource = /\b(where|source|saan|san|galing|kuha|nakuha|pinagkunan|based|base)\b/.test(haystack) ||
    /\bdid you get\b/.test(haystack);
  const mentionsFareData = /\b(fare|fares|pamasahe|pmasahe|bayad|price|prices|pricing|matrix|rate|rates)\b/.test(haystack);
  return asksSource && mentionsFareData;
}

function normalizePassengerText(value) {
  return normalizeLookupText(value)
    .replace(/\bsestudyante\b/g, ' estudyante ')
    .replace(/\besstudyante\b/g, ' estudyante ')
    .replace(/\bestudiante\b/g, ' estudyante ')
    .replace(/\bestudyanti\b/g, ' estudyante ')
    .replace(/\bsenyor\b/g, ' senior ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFilipinoMessage(value) {
  const text = normalizePassengerText(value);
  return /\b(po|opo|eh|ba|naman|wow|nice|sige|kaso|pala|nalang|lang|kandong|kumandong|kalong|karga|kasama|pano|paano|kung|kng|ano|kamusta|kumusta|salamat|sa|kami|kaming|tayo|tayong|magkano|bayad|pamasahe|pmasahe|presyo|gasolina|gasolinahan|mura|murang|mahal|pinakamura|pinakamurang|pinakamahal|lugar|lokasyon|estudyante|studyante|senior|pwd|sakay|sasakay|galing|papunta|punta|hanggang|saan|san|ilan|ilang|meron|may|ngayon|kuha|nakuha|lalagpas|lumagpas|lagpas|lampas|dalawa|dalawang|tatlo|tatlong|apat|lima|limang|sampu)\b/.test(text);
}

function fareLocationAliases() {
  return {
    indang: ['indang', 'indan', 'alulod', 'alulod indang', 'indang bayan', 'indang terminal'],
    trece: ['trece', 'trece martires', 'trece martirez', 'tmc'],
    alfonso: ['alfonso'],
    dasma: ['dasma', 'dasmarinas', 'dasmariñas', 'pala pala', 'palapala', 'pala-pala', 'pala pala dasma', 'pala pala terminal'],
    olivarez: ['olivarez', 'tagaytay', 'olivarez tagaytay'],
    gma: ['gma', 'general mariano alvarez', 'gen mariano alvarez'],
    silang: ['silang'],
    carmona: ['carmona']
  };
}

function aliasPattern(alias) {
  return alias.split(/\s+/).map(function(part) {
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('\\s+');
}

function findFareLocationMentions(text) {
  const normalized = normalizedFareText(text);
  const aliases = fareLocationAliases();
  const mentions = [];

  Object.keys(aliases).forEach(function(key) {
    aliases[key].forEach(function(alias) {
      const normalizedAlias = normalizedFareText(alias);
      if (!normalizedAlias) return;

      const pattern = new RegExp(`\\b${aliasPattern(normalizedAlias)}\\b`, 'g');
      let match;
      while ((match = pattern.exec(normalized)) !== null) {
        mentions.push({
          key,
          alias: normalizedAlias,
          index: match.index,
          length: match[0].length
        });
      }
    });
  });

  return mentions.sort(function(a, b) {
    if (a.index !== b.index) return a.index - b.index;
    return b.length - a.length;
  }).filter(function(mention, index, list) {
    return !list.slice(0, index).some(function(existing) {
      return existing.key === mention.key ||
        (mention.index >= existing.index && mention.index < existing.index + existing.length);
    });
  });
}

function orderedLocationKeys(text) {
  const haystack = normalizedFareText(text);
  const mentions = findFareLocationMentions(text);

  for (let fromIndex = 0; fromIndex < mentions.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < mentions.length; toIndex += 1) {
      const fromMention = mentions[fromIndex];
      const toMention = mentions[toIndex];
      if (fromMention.key === toMention.key) continue;

      const fromToPattern = new RegExp(`\\bfrom\\s+${aliasPattern(fromMention.alias)}\\b[\\s\\S]{0,80}\\bto\\s+${aliasPattern(toMention.alias)}\\b`);
      const toFromPattern = new RegExp(`\\bto\\s+${aliasPattern(toMention.alias)}\\b[\\s\\S]{0,80}\\bfrom\\s+${aliasPattern(fromMention.alias)}\\b`);

      if (fromToPattern.test(haystack) || toFromPattern.test(haystack)) {
        return [fromMention.key, toMention.key];
      }
    }
  }

  if (mentions.length) {
    return mentions.map(function(mention) {
      return mention.key;
    });
  }

  const keys = ['indang', 'trece', 'alfonso', 'dasma', 'olivarez', 'gma', 'silang', 'carmona'];

  for (let fromIndex = 0; fromIndex < keys.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < keys.length; toIndex += 1) {
      const fromKey = keys[fromIndex];
      const toKey = keys[toIndex];
      if (fromKey === toKey) continue;

      const fromToPattern = new RegExp(`\\bfrom\\s+${fromKey}\\b[\\s\\S]{0,80}\\bto\\s+${toKey}\\b`);
      const toFromPattern = new RegExp(`\\bto\\s+${toKey}\\b[\\s\\S]{0,80}\\bfrom\\s+${fromKey}\\b`);

      if (fromToPattern.test(haystack) || toFromPattern.test(haystack)) {
        return [fromKey, toKey];
      }
    }
  }

  return keys.map(function(key) {
    const index = haystack.indexOf(key);
    if (index < 0) return null;
    return { key, index };
  }).filter(Boolean).sort(function(a, b) {
    return a.index - b.index;
  }).map(function(entry) {
    return entry.key;
    });
}

function directionForLocation(text, locationKey) {
  const haystack = normalizedFareText(text);
  const aliases = fareLocationAliases()[locationKey] || [locationKey];

  for (let index = 0; index < aliases.length; index += 1) {
    const alias = normalizedFareText(aliases[index]);
    if (!alias) continue;

    const pattern = aliasPattern(alias);
    if (new RegExp(`\\bfrom\\s+${pattern}\\b`).test(haystack)) return 'from';
    if (new RegExp(`\\bto\\s+${pattern}\\b`).test(haystack)) return 'to';
  }

  return null;
}

function resolveFareLocations(currentLocations, previousLocations, question) {
  if (currentLocations.length >= 2) return currentLocations;
  if (previousLocations.length < 2) return currentLocations;

  if (currentLocations.length === 1) {
    const singleLocation = currentLocations[0];
    const direction = directionForLocation(question, singleLocation);

    if (direction === 'from') {
      const destination = previousLocations[1] === singleLocation ? previousLocations[0] : previousLocations[1];
      return [singleLocation, destination];
    }

    const start = previousLocations[0] === singleLocation ? previousLocations[1] : previousLocations[0];
    return [start, singleLocation];
  }

  return previousLocations;
}

function passengerNumberPattern() {
  return '(\\d+|isa(?:ng)?|one|dalawa(?:ng)?|dalwa|dlawa|two|tatlo(?:ng)?|three|apat|four|lima(?:ng)?|five|anim|six|pito(?:ng)?|seven|walo(?:ng)?|eight|siyam|nine|sampu(?:ng)?|ten)';
}

function passengerNumberValue(value) {
  const token = normalizeLookupText(value);
  const words = {
    isa: 1,
    isang: 1,
    one: 1,
    dalawa: 2,
    dalawang: 2,
    dalwa: 2,
    dlawa: 2,
    two: 2,
    tatlo: 3,
    tatlong: 3,
    three: 3,
    apat: 4,
    four: 4,
    lima: 5,
    limang: 5,
    five: 5,
    anim: 6,
    six: 6,
    pito: 7,
    pitong: 7,
    seven: 7,
    walo: 8,
    walong: 8,
    eight: 8,
    siyam: 9,
    nine: 9,
    sampu: 10,
    sampung: 10,
    ten: 10
  };

  if (/^\d+$/.test(token)) return Number(token);
  return words[token] || 0;
}

function hasPassengerTypeLanguage(question) {
  const text = normalizePassengerText(question);
  return /\b(student|students|estudyante|studyante|senior|seniors|senior citizen|senior citizens|sc|pwd|pwds|person with disability|disabled|regular|regulars|standard|normal|discounted)\b/.test(text);
}

function hasPassengerCountLanguage(question) {
  const text = normalizePassengerText(question);
  const count = passengerNumberPattern();
  return new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?|tayo(?:ng)?|kasama|person|people|passengers?|pax|riders?|sasakay)\\b`).test(text) ||
    new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:regulars?|students?|estudyante|studyante|seniors?|senior citizens?|sc|pwds?|pwd passengers?|persons?\\s+with\\s+disabilit(?:y|ies)|disabled)\\b`).test(text);
}

function hasExplicitPassengerMix(question) {
  return hasPassengerCountLanguage(question) || hasPassengerTypeLanguage(question);
}

function parsePassengerMix(question) {
  const text = normalizePassengerText(question);
  const count = passengerNumberPattern();
  const mix = {
    regular: 0,
    student: 0,
    senior: 0,
    pwd: 0,
    total: 0
  };

  const totalMatch = text.match(new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?|tayo(?:ng)?|kasama|person|people|passengers?|pax|riders?|sasakay)\\b`));
  const totalPassengers = totalMatch ? passengerNumberValue(totalMatch[1]) : 0;

  const typePatterns = {
    regular: new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?\\s+|tayo(?:ng)?\\s+)?(?:more\\s+|additional\\s+|extra\\s+)?(?:regulars?|standard(?:\\s+passengers?)?|normal)\\b`, 'g'),
    student: new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?\\s+|tayo(?:ng)?\\s+)?(?:more\\s+|additional\\s+|extra\\s+)?(?:students?|student passengers?|estudyante|studyante)\\b`, 'g'),
    senior: new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?\\s+|tayo(?:ng)?\\s+)?(?:more\\s+|additional\\s+|extra\\s+)?(?:seniors?|senior citizens?|sc)\\b`, 'g'),
    pwd: new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kami(?:ng)?\\s+|tayo(?:ng)?\\s+)?(?:more\\s+|additional\\s+|extra\\s+)?(?:pwds?|pwd passengers?|persons?\\s+with\\s+disabilit(?:y|ies)|disabled)\\b`, 'g')
  };

  Object.keys(typePatterns).forEach(function(type) {
    let match;
    while ((match = typePatterns[type].exec(text)) !== null) {
      mix[type] += passengerNumberValue(match[1]);
    }
  });

  const typedCount = mix.regular + mix.student + mix.senior + mix.pwd;

  if (!typedCount) {
    if (totalPassengers > 1) {
      mix.regular = totalPassengers;
      mix.total = totalPassengers;
      return mix;
    }

    const passengerType = knowledge.detectPassengerType(question);
    mix[passengerType] = 1;
    mix.total = 1;
    return mix;
  }

  if (totalPassengers > typedCount) {
    mix.regular += totalPassengers - typedCount;
  }

  mix.total = mix.regular + mix.student + mix.senior + mix.pwd;
  return mix;
}

function clonePassengerMix(mix) {
  return {
    regular: Number(mix && mix.regular) || 0,
    student: Number(mix && mix.student) || 0,
    senior: Number(mix && mix.senior) || 0,
    pwd: Number(mix && mix.pwd) || 0,
    total: Number(mix && mix.total) || 0
  };
}

function mergePassengerMix(baseMix, deltaMix) {
  const merged = {
    regular: (Number(baseMix && baseMix.regular) || 0) + (Number(deltaMix && deltaMix.regular) || 0),
    student: (Number(baseMix && baseMix.student) || 0) + (Number(deltaMix && deltaMix.student) || 0),
    senior: (Number(baseMix && baseMix.senior) || 0) + (Number(deltaMix && deltaMix.senior) || 0),
    pwd: (Number(baseMix && baseMix.pwd) || 0) + (Number(deltaMix && deltaMix.pwd) || 0)
  };

  merged.total = merged.regular + merged.student + merged.senior + merged.pwd;
  return merged;
}

function passengerTypesInMix(mix) {
  return ['regular', 'student', 'senior', 'pwd'].filter(function(type) {
    return Number(mix && mix[type]) > 0;
  });
}

function applyImplicitCountToPreviousType(currentMix, previousMix) {
  const total = Number(currentMix && currentMix.total) || 0;
  if (!total) return clonePassengerMix(currentMix);

  const previousTypes = passengerTypesInMix(previousMix);
  if (previousTypes.length !== 1) return clonePassengerMix(currentMix);

  const nextMix = {
    regular: 0,
    student: 0,
    senior: 0,
    pwd: 0,
    total
  };
  nextMix[previousTypes[0]] = total;
  return nextMix;
}

function hasLapRiderLanguage(question) {
  const text = normalizePassengerText(question);
  return /\b(kumandong|kandong|kakandong|nakandong|kalong|karga|lap)\b/.test(text);
}

function lapRiderCount(question) {
  const text = normalizePassengerText(question);
  const count = passengerNumberPattern();
  const match = text.match(new RegExp(`\\b${count}\\s*(?:na\\s+)?(?:kasama|passenger|person|bata|anak|rider)\\b`)) ||
    text.match(new RegExp(`\\b(?:ang\\s+)?${count}\\s*(?:na\\s+)?(?:kasama|passenger|person|bata|anak|rider)\\b`));

  return match ? Math.max(1, passengerNumberValue(match[1])) : 1;
}

function subtractPassengerCount(baseMix, count) {
  const nextMix = clonePassengerMix(baseMix);
  let remaining = Math.max(0, Number(count) || 0);

  ['regular', 'student', 'senior', 'pwd'].forEach(function(type) {
    if (!remaining) return;
    const removable = Math.min(nextMix[type], remaining);
    nextMix[type] -= removable;
    remaining -= removable;
  });

  nextMix.total = nextMix.regular + nextMix.student + nextMix.senior + nextMix.pwd;
  return nextMix;
}

function formatPassengerBreakdown(mix, faresByType, language) {
  return ['regular', 'student', 'senior', 'pwd'].filter(function(type) {
    return mix[type] > 0 && faresByType[type];
  }).map(function(type) {
    const count = mix[type];
    const typeLabel = passengerTypeLabel(type, language);
    if (language === 'filipino') {
      return `${count} ${typeLabel} sa ${formatCurrency(faresByType[type].fare)} bawat isa`;
    }
    return `${count} ${typeLabel}${count === 1 ? '' : 's'} at ${formatCurrency(faresByType[type].fare)} each`;
  }).join(', ');
}

function formatPassengerSummary(mix, language) {
  const parts = [];

  if (language === 'filipino') {
    if (mix.student) parts.push(`${mix.student} estudyante`);
    if (mix.regular) parts.push(`${mix.regular} regular`);
    if (mix.senior) parts.push(`${mix.senior} senior`);
    if (mix.pwd) parts.push(`${mix.pwd} PWD`);
    return parts.join(', ');
  }

  if (mix.student) parts.push(`${mix.student} student${mix.student === 1 ? '' : 's'}`);
  if (mix.regular) parts.push(`${mix.regular} regular${mix.regular === 1 ? '' : 's'}`);
  if (mix.senior) parts.push(`${mix.senior} senior${mix.senior === 1 ? '' : 's'}`);
  if (mix.pwd) parts.push(`${mix.pwd} PWD${mix.pwd === 1 ? '' : 's'}`);

  return parts.join(', ');
}

function detectFuelType(text) {
  const haystack = normalizeLookupText(text);
  if (haystack.includes('diesel') || haystack.includes('krudo')) return 'diesel';
  if (haystack.includes('gasoline') ||
    haystack.includes('unleaded') ||
    haystack.includes('gasolina') ||
    haystack.includes('gas')) return 'unleaded';
  return null;
}

function getGasAreaAliasMap(snapshot) {
  const areas = Array.isArray(snapshot && snapshot.areas) ? snapshot.areas : [];
  const aliases = new Map();

  areas.forEach(function(area) {
    aliases.set(normalizeLookupText(area), area);
  });

  const preferredAliases = {
    dasma: 'Dasmariñas',
    dasmarinas: 'Dasmariñas',
    trece: 'Trece Martires',
    'trece martires': 'Trece Martires',
    tagaytay: 'Tagaytay',
    olivarez: 'Tagaytay',
    indang: 'Indang',
    alfonso: 'Alfonso',
    mendez: 'Mendez',
    silang: 'Silang',
    'cavite city': 'Cavite City',
    gma: 'General Mariano Alvarez',
    'gma cavite': 'General Mariano Alvarez',
    'general mariano alvarez': 'General Mariano Alvarez',
    'general mariano alvarez cavite': 'General Mariano Alvarez',
    'san pedro': 'San Pedro',
    cabuyao: 'Cabuyao',
    calamba: 'Calamba',
    'santa rosa': 'Santa Rosa',
    'biñan': 'Biñan',
    binan: 'Biñan'
  };

  Object.keys(preferredAliases).forEach(function(alias) {
    const target = preferredAliases[alias];
    if (areas.includes(target)) {
      aliases.set(normalizeLookupText(alias), target);
    }
  });

  return aliases;
}

function detectGasArea(text, snapshot, selections, options) {
  const normalized = normalizeLookupText(text);
  const aliasMap = getGasAreaAliasMap(snapshot);
  const aliases = Array.from(aliasMap.keys()).sort(function(a, b) {
    return b.length - a.length;
  });

  for (let index = 0; index < aliases.length; index += 1) {
    const alias = aliases[index];
    if (normalized.includes(alias)) {
      return aliasMap.get(alias);
    }
  }

  if (options && options.explicitOnly) {
    return null;
  }

  const selectedArea = selections && selections['fuel-area-select'];
  if (selectedArea && selectedArea !== 'all') {
    return selectedArea;
  }

  return null;
}

function hasGasLanguage(text) {
  const haystack = normalizeLookupText(text);
  return haystack.includes('gas') ||
    haystack.includes('fuel') ||
    haystack.includes('diesel') ||
    haystack.includes('krudo') ||
    haystack.includes('gasoline') ||
    haystack.includes('gasolina') ||
    haystack.includes('gasolinahan') ||
    haystack.includes('unleaded') ||
    haystack.includes('fuel station') ||
    haystack.includes('gas station');
}

function findRecentUserMessage(history, predicate) {
  if (!Array.isArray(history) || typeof predicate !== 'function') return '';

  for (let index = history.length - 1; index >= 0 && index >= history.length - 8; index -= 1) {
    const entry = history[index];
    if (!entry || entry.role !== 'user') continue;

    const content = String(entry.content || '').trim();
    if (predicate(content)) return content;
  }

  return '';
}

function gasContextFromText(text, snapshot, selections) {
  const source = String(text || '');
  const lowered = normalizeLookupText(source);
  const focus = lowered.includes('highest') ||
    lowered.includes('most expensive') ||
    lowered.includes('pinakamahal') ||
    lowered.includes('mahal')
    ? 'highest'
    : (lowered.includes('cheapest') ||
      lowered.includes('lowest') ||
      lowered.includes('pinakamura') ||
      lowered.includes('pinaka mura') ||
      lowered.includes('mura') ||
      lowered.includes('saan') ||
      lowered.includes('san') ||
      lowered.includes('where')
      ? 'cheapest'
      : 'summary');
  const explicitArea = detectGasArea(source, snapshot, null, { explicitOnly: true });

  return {
    fuelType: detectFuelType(source),
    area: explicitArea || (focus === 'summary' ? detectGasArea(source, snapshot, selections) : null),
    hasExplicitArea: Boolean(explicitArea),
    focus
  };
}

function resolveGasScenario(question, history, context, snapshot) {
  const selections = context && context.selections ? context.selections : {};
  const previousQuestion = findRecentUserMessage(history, hasGasLanguage) || findLastUserMessage(history);
  const current = gasContextFromText(question, snapshot, selections);
  const previous = previousQuestion ? gasContextFromText(previousQuestion, snapshot, selections) : null;
  const text = normalizeLookupText(question);
  const followUp = /(?:what about|how about|there|that one|that area|that place|where|paano|pano|eh|naman|doon|dun|dyan|iyan|yun|saan|san|\bsa\b)/.test(text) ||
    (Boolean(current.hasExplicitArea) && !hasGasLanguage(question));

  return {
    fuelType: current.fuelType || (previous && previous.fuelType) || (selections['fuel-type-select'] === 'diesel' ? 'diesel' : 'unleaded'),
    area: current.area || (followUp && previous ? previous.area : null),
    focus: current.focus !== 'summary'
      ? current.focus
      : ((followUp && previous && previous.focus) ? previous.focus : 'summary')
  };
}

function getFuelStations(snapshot, fuelType, area) {
  const fuelKey = fuelType === 'diesel' ? 'diesel' : 'unleaded';

  return (Array.isArray(snapshot && snapshot.stations) ? snapshot.stations : [])
    .map(function(station) {
      return {
        station: station.station,
        area: station.area,
        brand: station.brand,
        price: station[fuelKey]
      };
    })
    .filter(function(entry) {
      if (typeof entry.price !== 'number' || Number.isNaN(entry.price)) return false;
      if (area && entry.area !== area) return false;
      return true;
    })
    .sort(function(a, b) {
      return a.price - b.price;
    });
}

function fuelAreasAnswer(snapshot, language) {
  const stations = Array.isArray(snapshot && snapshot.stations) ? snapshot.stations : [];
  const areas = Array.from(new Set(stations.filter(function(station) {
    return typeof station.unleaded === 'number' ||
      typeof station.diesel === 'number';
  }).map(function(station) {
    return station.area;
  }).filter(Boolean))).sort(function(a, b) {
    return a.localeCompare(b);
  });

  if (!areas.length) {
    return language === 'filipino'
      ? `Wala munang available na fuel areas mula sa ${snapshot.sourceName} ngayon. Source update: ${snapshot.lastUpdated}.`
      : `No fuel areas are available from ${snapshot.sourceName} right now. Source update: ${snapshot.lastUpdated}.`;
  }

  return language === 'filipino'
    ? `Ito ang available na fuel lookup areas mula sa ${snapshot.sourceName}: ${areas.join(', ')}. Source update: ${snapshot.lastUpdated}.`
    : `Available fuel lookup areas from ${snapshot.sourceName}: ${areas.join(', ')}. Source update: ${snapshot.lastUpdated}.`;
}

function fuelAreaPromptSummary(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.stations)) return 'Fuel area data unavailable.';

  const areas = Array.isArray(snapshot.areas) ? snapshot.areas : [];
  const stationLines = areas.slice(0, 24).map(function(area) {
    const stations = getFuelStations(snapshot, 'unleaded', area).slice(0, 2);
    if (!stations.length) return `${area}: no Gasoline 91 price available`;
    return `${area}: ${stations.map(function(station) {
      return `${station.station} ${formatCurrency(station.price)}`;
    }).join('; ')}`;
  });

  return [
    `Available fuel areas: ${areas.join(', ')}.`,
    'Gasoline 91 station examples by area:',
    stationLines.join('\n')
  ].join('\n');
}

function extractFareContextFromText(text) {
  return {
    locations: orderedLocationKeys(text),
    vehicleType: knowledge.detectVehicleType(text),
    passengerMix: parsePassengerMix(text),
    hasExplicitPassengerMix: hasExplicitPassengerMix(text),
    hasExplicitPassengerType: hasPassengerTypeLanguage(text),
    hasExplicitPassengerCount: hasPassengerCountLanguage(text),
    hasLapRiderAdjustment: hasLapRiderLanguage(text),
    lapRiderCount: lapRiderCount(text)
  };
}

function hasFareAnswerContent(content) {
  const text = String(content || '').toLowerCase();
  return text.includes('final fare') ||
    text.includes('kabuuang pamasahe') ||
    text.includes('computed fare') ||
    text.includes('pamasahe sa') ||
    text.includes('calculated from site fare data');
}

function recentFareContext(history, currentMessage) {
  const context = {
    locations: [],
    vehicleType: null,
    passengerMix: null
  };

  if (!Array.isArray(history)) return context;

  const start = Math.max(0, history.length - 12);
  for (let index = start; index < history.length; index += 1) {
    const entry = history[index];
    if (!entry || !['user', 'assistant'].includes(entry.role)) continue;

    const content = String(entry.content || '').trim();
    if (!content || sameMessage(content, currentMessage)) continue;

    const assistantFareAnswer = entry.role === 'assistant' && hasFareAnswerContent(content);
    if (entry.role === 'assistant' && !assistantFareAnswer) continue;

    const contextSource = assistantFareAnswer ? content.split(/Breakdown:/i)[0] : content;
    const extracted = extractFareContextFromText(contextSource);
    const hasFareSignal = assistantFareAnswer ||
      hasFareLanguage(content) ||
      extracted.hasExplicitPassengerMix ||
      Boolean(extracted.vehicleType);

    if (!hasFareSignal && !context.locations.length) continue;

    if (extracted.locations.length >= 2) {
      context.locations = extracted.locations;
    }

    if (extracted.vehicleType) {
      context.vehicleType = extracted.vehicleType;
    }

    if (assistantFareAnswer) {
      if (extracted.hasExplicitPassengerMix) {
        context.passengerMix = clonePassengerMix(extracted.passengerMix);
      }
    } else if (extracted.hasLapRiderAdjustment && context.passengerMix) {
      context.passengerMix = subtractPassengerCount(context.passengerMix, extracted.lapRiderCount);
    } else if (/(?:add|plus|another|more|additional|extra)\b/.test(normalizedFareText(content)) && context.passengerMix) {
      context.passengerMix = mergePassengerMix(context.passengerMix, extracted.passengerMix);
    } else if (extracted.hasExplicitPassengerMix || (hasFareQuestionLanguage(content) && !context.passengerMix)) {
      context.passengerMix = extracted.hasExplicitPassengerCount && !extracted.hasExplicitPassengerType && context.passengerMix
        ? applyImplicitCountToPreviousType(extracted.passengerMix, context.passengerMix)
        : clonePassengerMix(extracted.passengerMix);
    }
  }

  return context;
}

function resolveFareScenario(question, history) {
  const text = String(question || '').toLowerCase();
  const current = extractFareContextFromText(question);
  const previous = recentFareContext(history, question);
  const isAdjustment = /(?:add|plus|another|more|additional|extra)\b/.test(text);
  const compareRequested = !isFareSourceQuestion(question) &&
    /(?:compare|comparison|vs|versus|cheaper|cheapest|difference)/.test(text);
  const locations = resolveFareLocations(current.locations, previous.locations, question);
  const vehicleType = current.vehicleType || previous.vehicleType || 'jeepney';
  let passengerMix = current.hasExplicitPassengerMix || !previous.passengerMix
    ? clonePassengerMix(current.passengerMix)
    : clonePassengerMix(previous.passengerMix);

  if (current.hasExplicitPassengerCount && !current.hasExplicitPassengerType && previous.passengerMix) {
    passengerMix = applyImplicitCountToPreviousType(current.passengerMix, previous.passengerMix);
  }

  if (current.hasLapRiderAdjustment && previous.passengerMix && previous.passengerMix.total > 0) {
    passengerMix = subtractPassengerCount(previous.passengerMix, current.lapRiderCount);
  } else if (isAdjustment && previous.passengerMix && previous.passengerMix.total > 0) {
    passengerMix = mergePassengerMix(previous.passengerMix, current.passengerMix);
  } else if (!passengerMix.total && previous.passengerMix && previous.passengerMix.total > 0) {
    passengerMix = clonePassengerMix(previous.passengerMix);
  }

  return {
    locations,
    vehicleType,
    passengerMix,
    compareRequested,
    previousVehicleType: previous.vehicleType || null,
    hasLapRiderAdjustment: current.hasLapRiderAdjustment,
    lapRiderCount: current.lapRiderCount
  };
}

function vehicleTypeLabel(value, language) {
  const label = titleCase(value);
  if (language === 'filipino' && value === 'jeepney') return 'Jeepney';
  return label;
}

function isVehicleAvailabilityQuestion(message) {
  const text = normalizedFareText(message);
  const mentionsVehicle = /\b(vehicle|vehicles|available|jeepney|jeep|dyip|jip|bus|tricycle|trike|sasakyan|unit|units)\b/.test(text);
  const asksAvailability = /\b(ilan|ilang|how many|available|avail|meron|may|status|tracking|track|ngayon|current|online|active)\b/.test(text);
  return mentionsVehicle && asksAvailability;
}

function vehiclesAnswer(question, context) {
  const summary = currentFleetSummary(context);
  const text = String(question || '').toLowerCase();
  const language = isFilipinoMessage(question) ? 'filipino' : 'english';
  const entries = context && context.fleet && Array.isArray(context.fleet.entries)
    ? context.fleet.entries
    : knowledge.getFleetSnapshot({ publishedDrivers: currentDriverRecords(context) });
  const requestedRoute = knowledge.getRouteCatalog().find(function(route) {
    return text.includes(route.id) || text.includes(route.shortLabel.toLowerCase());
  });
  const requestedType = knowledge.detectVehicleType(text);

  if (requestedRoute && requestedType) {
    const matchingEntries = entries.filter(function(entry) {
      return entry.route === requestedRoute.id && entry.type === requestedType;
    });
    const availableCount = matchingEntries.filter(function(entry) {
      return entry.status === 'available';
    }).length;
    return language === 'filipino'
      ? `Sa ${requestedRoute.label}, may ${matchingEntries.length} ${vehicleTypeLabel(requestedType, language)} unit sa site data. ${availableCount} ang marked available ngayon.`
      : `${requestedRoute.label} currently has ${matchingEntries.length} ${titleCase(requestedType)} unit${matchingEntries.length === 1 ? '' : 's'} in the site data, with ${availableCount} marked available.`;
  }

  if (requestedType) {
    const typeData = summary.byType[requestedType];
    if (!typeData) {
      return language === 'filipino'
        ? `Wala pang listed na ${vehicleTypeLabel(requestedType, language)} units ngayon.`
        : `No ${titleCase(requestedType)} units are listed right now.`;
    }
    return language === 'filipino'
      ? `Sa ngayon, may ${typeData.available} available na ${vehicleTypeLabel(requestedType, language)} out of ${typeData.total} total. ${typeData.limited} limited, ${typeData.unavailable} unavailable.`
      : `${titleCase(requestedType)}: ${typeData.total} total, ${typeData.available} available, ${typeData.limited} limited, ${typeData.unavailable} unavailable.`;
  }

  if (requestedRoute) {
    const routeData = summary.byRoute[requestedRoute.id];
    if (!routeData) {
      return language === 'filipino'
        ? `Wala pang listed vehicles sa ${requestedRoute.label} ngayon.`
        : `${requestedRoute.label} has no vehicles listed right now.`;
    }
    const mix = Object.keys(routeData.types).map(function(type) {
      return `${titleCase(type)} ${routeData.types[type]}`;
    }).join(', ');
    return language === 'filipino'
      ? `${requestedRoute.label}: ${routeData.available} available out of ${routeData.total} total. ${routeData.limited} limited, ${routeData.unavailable} unavailable. Vehicle mix: ${mix}.`
      : `${requestedRoute.label}: ${routeData.total} total, ${routeData.available} available, ${routeData.limited} limited, ${routeData.unavailable} unavailable. Vehicle mix: ${mix}.`;
  }

  return language === 'filipino'
    ? `Fleet ngayon: ${summary.totals.available} available out of ${summary.totals.total} total vehicles. ${summary.totals.limited} limited, ${summary.totals.unavailable} unavailable.`
    : `Current fleet snapshot: ${summary.totals.total} vehicles total, ${summary.totals.available} available, ${summary.totals.limited} limited, and ${summary.totals.unavailable} unavailable.`;
}

function fareAnswer(question) {
  return fareAnswerWithHistory(question, []);
}

function calculateFareDetails(locations, vehicleType, passengerMix, language) {
  const faresByType = {};

  ['regular', 'student', 'senior', 'pwd'].forEach(function(type) {
    if (passengerMix[type] > 0) {
      faresByType[type] = knowledge.getFareEstimate(locations[0], locations[1], vehicleType, type);
    }
  });

  const estimates = Object.values(faresByType).filter(Boolean);
  if (!estimates.length) return null;

  const baseEstimate = estimates[0];
  const totalFare = ['regular', 'student', 'senior', 'pwd'].reduce(function(sum, type) {
    if (!passengerMix[type] || !faresByType[type]) return sum;
    return sum + (passengerMix[type] * faresByType[type].fare);
  }, 0);

  return {
    vehicleType,
    passengerMix,
    faresByType,
    estimates,
    baseEstimate,
    totalFare,
    breakdown: formatPassengerBreakdown(passengerMix, faresByType, language),
    summary: formatPassengerSummary(passengerMix, language)
  };
}

function formatFareDetails(details, language) {
  const passengerMix = details.passengerMix;
  const baseEstimate = details.baseEstimate;
  const filipino = language === 'filipino';

  if (passengerMix.total <= 1) {
    const passengerType = ['regular', 'student', 'senior', 'pwd'].find(function(type) {
      return passengerMix[type] > 0;
    }) || 'regular';

    if (filipino) {
      return [
        `Pamasahe sa ${titleCase(details.vehicleType)} mula ${locationLabel(baseEstimate.startLocation)} papuntang ${locationLabel(baseEstimate.destination)} para sa isang ${passengerTypeLabel(passengerType, language)} passenger.`,
        'Kabuuang pamasahe',
        `**${formatCurrency(baseEstimate.fare)}**`,
        `Layo: ${baseEstimate.distanceKm} km.`
      ].join('\n');
    }

    return [
      `${titleCase(details.vehicleType)} fare from ${locationLabel(baseEstimate.startLocation)} to ${locationLabel(baseEstimate.destination)} for a ${passengerTypeLabel(passengerType, language)} passenger.`,
      'Final fare',
      `**${formatCurrency(baseEstimate.fare)}**`,
      `Distance: ${baseEstimate.distanceKm} km.`
    ].join('\n');
  }

  if (filipino) {
    return [
      `Pamasahe sa ${titleCase(details.vehicleType)} mula ${locationLabel(baseEstimate.startLocation)} papuntang ${locationLabel(baseEstimate.destination)} para sa ${passengerMix.total} pasahero${details.summary ? ` (${details.summary})` : ''}.`,
      'Kabuuang pamasahe',
      `**${formatCurrency(details.totalFare)} total**`,
      `Breakdown: ${details.breakdown}.`,
      `Layo: ${baseEstimate.distanceKm} km.`
    ].join('\n');
  }

  return [
    `${titleCase(details.vehicleType)} fare from ${locationLabel(baseEstimate.startLocation)} to ${locationLabel(baseEstimate.destination)} for ${passengerMix.total} passengers${details.summary ? ` (${details.summary})` : ''}.`,
    'Final fare',
    `**${formatCurrency(details.totalFare)} total**`,
    `Breakdown: ${details.breakdown}.`,
    `Distance: ${baseEstimate.distanceKm} km.`
  ].join('\n');
}

function formatFareComparison(currentDetails, comparisonDetails, language) {
  const difference = Math.abs(currentDetails.totalFare - comparisonDetails.totalFare);
  const cheaper = currentDetails.totalFare < comparisonDetails.totalFare
    ? currentDetails
    : comparisonDetails;
  const filipino = language === 'filipino';

  const comparisonLines = [
    '',
    filipino ? 'Paghahambing' : 'Comparison',
    `${titleCase(comparisonDetails.vehicleType)}: **${formatCurrency(comparisonDetails.totalFare)} total**`,
    `${titleCase(currentDetails.vehicleType)}: **${formatCurrency(currentDetails.totalFare)} total**`
  ];

  if (difference > 0) {
    comparisonLines.push(filipino
      ? `Mas mura ang ${titleCase(cheaper.vehicleType)} ng **${formatCurrency(difference)}** para sa grupo.`
      : `${titleCase(cheaper.vehicleType)} is cheaper by **${formatCurrency(difference)}** for this group.`);
  } else {
    comparisonLines.push(filipino
      ? 'Pareho lang ang presyo ng dalawang option para sa grupo.'
      : 'Both options cost the same for this group.');
  }

  return `${formatFareDetails(currentDetails, language)}\n${comparisonLines.join('\n')}`;
}

function fareSourceAnswer(scenario, language) {
  const filipino = language === 'filipino';
  const lines = [
    filipino
      ? 'Galing ang fare prices sa fare matrix at local distance estimates na gamit ng spot.ph fare calculator.'
      : 'Fare prices are calculated from the site fare matrix and local distance estimates used by the spot.ph fare calculator.',
    filipino
      ? 'Jeepney rule: PHP 13.00 sa unang 4 km, tapos PHP 1.80 kada dagdag na km.'
      : 'Jeepney rule: PHP 13.00 for the first 4 km, then PHP 1.80 per extra km.',
    filipino
      ? 'Student, senior, at PWD fares ay may 20% discount bago i-round.'
      : 'Student, senior, and PWD fares use a 20% discount before rounding.',
    filipino
      ? 'Bus rule: PHP 2.10 kada km, may same discount din para sa eligible passengers.'
      : 'Bus rule: PHP 2.10 per km, also with the same discount for eligible passengers.',
    filipino
      ? 'Planning estimate ito sa project, hindi live government fare API.'
      : 'These are planning estimates inside this project, not a live government fare API.'
  ];

  if (scenario.locations.length >= 2) {
    const details = calculateFareDetails(scenario.locations, scenario.vehicleType, scenario.passengerMix, language);
    if (details) {
      lines.push(filipino
        ? `Sa saved trip (${locationLabel(scenario.locations[0])} to ${locationLabel(scenario.locations[1])}), ${details.baseEstimate.distanceKm} km ang gamit na distance at ${formatCurrency(details.totalFare)}${details.passengerMix.total > 1 ? ' total' : ''} ang computed fare.`
        : `For the saved trip (${locationLabel(scenario.locations[0])} to ${locationLabel(scenario.locations[1])}), the distance used is ${details.baseEstimate.distanceKm} km and the current computed fare is ${formatCurrency(details.totalFare)}${details.passengerMix.total > 1 ? ' total' : ''}.`);
    }
  }

  return lines.join('\n');
}

function fareOverrunAnswer(scenario, language) {
  const routeText = scenario.locations.length >= 2
    ? `${locationLabel(scenario.locations[0])} to ${locationLabel(scenario.locations[1])}`
    : 'your last route';
  const passengerText = scenario.passengerMix && scenario.passengerMix.total
    ? ` for ${formatPassengerSummary(scenario.passengerMix, language) || `${scenario.passengerMix.total} passenger${scenario.passengerMix.total === 1 ? '' : 's'}`}`
    : '';

  if (language !== 'filipino') {
    return [
      `If you go past ${routeText}, I need the new drop-off point so I can compute it correctly.`,
      `Current saved trip: ${titleCase(scenario.vehicleType || 'jeepney')} ${routeText}${passengerText}.`,
      'Example: "up to GMA", "to Carmona", or "Silang to Carmona".',
      'Student, senior, and PWD discounts still apply once the new destination is clear.'
    ].join('\n');
  }

  return [
    `Kung lalagpas ka sa ${routeText}, kailangan ko yung bagong bababaan para ma-compute nang tama.`,
    `Current saved trip: ${titleCase(scenario.vehicleType || 'jeepney')} ${routeText}${passengerText}.`,
    'Example: "hanggang GMA", "to Carmona", or "Silang to Carmona".',
    'Discounts for student, senior, and PWD still apply once the new destination is clear.'
  ].join('\n');
}

function fareAnswerWithHistory(question, history) {
  const scenario = resolveFareScenario(question, history);
  const locations = scenario.locations;
  const vehicleType = scenario.vehicleType;
  const passengerMix = scenario.passengerMix;
  const language = isFilipinoMessage(question) ? 'filipino' : 'english';

  if (isFareSourceQuestion(question)) {
    return fareSourceAnswer(scenario, language);
  }

  if (isOverrunFareQuestion(question) && orderedLocationKeys(question).length === 0) {
    return fareOverrunAnswer(scenario, language);
  }

  if (locations.length >= 2) {
    const details = calculateFareDetails(locations, vehicleType, passengerMix, language);
    if (!details) {
      return language === 'filipino'
        ? 'Hindi ko makita yung fare combination na iyon sa current fare table.'
        : 'I could not find that fare combination in the current fare table.';
    }

    if (scenario.compareRequested) {
      const comparisonType = scenario.previousVehicleType && scenario.previousVehicleType !== vehicleType
        ? scenario.previousVehicleType
        : (vehicleType === 'bus' ? 'jeepney' : 'bus');
      const comparisonDetails = calculateFareDetails(locations, comparisonType, passengerMix, language);

      if (comparisonDetails) {
        const comparisonAnswer = formatFareComparison(details, comparisonDetails, language);
        if (scenario.hasLapRiderAdjustment) {
          return `${comparisonAnswer}\n${language === 'filipino'
            ? 'Assumption: yung kumandong na kasama ay hindi counted as separate paying passenger.'
            : 'Assumption: the lap-sitting companion is not counted as a separate paying passenger.'}`;
        }
        return comparisonAnswer;
      }
    }

    const answer = formatFareDetails(details, language);
    if (scenario.hasLapRiderAdjustment) {
      return `${answer}\n${language === 'filipino'
        ? 'Assumption: yung kumandong na kasama ay hindi counted as separate paying passenger.'
        : 'Assumption: the lap-sitting companion is not counted as a separate paying passenger.'}`;
    }
    return answer;
  }

  return language === 'filipino'
    ? 'Sabihin mo yung sakayan at bababaan, tulad ng "magkano jeep from Indang to Trece?"'
    : 'Ask a fare question with a start and destination, like "How much is the jeepney fare from Indang to Trece?"';
}

async function gasAnswer(question) {
  return gasAnswerWithHistory(question, [], {});
}

function formatFuelPriceAnswer(label, heading, price, station, area, snapshot, language) {
  if (language === 'filipino') {
    const headingText = heading === 'Cheapest' ? 'Pinakamurang presyo' : 'Pinakamataas na presyo';
    const intro = heading === 'Cheapest' ? 'Pinakamura' : 'Pinakamahal';
    return [
      `${intro} na ${label}${area ? ` sa ${area}` : ' ngayon'}.`,
      headingText,
      `**${formatCurrency(price)}**`,
      `Station: ${station}`,
      `Area: ${area || 'All tracked areas'}`,
      `Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`
    ].join('\n');
  }

  return [
    `${label} ${heading.toLowerCase()}${area ? ` in ${area}` : ' currently'}.`,
    `${heading} price`,
    `**${formatCurrency(price)}**`,
    `Station: ${station}`,
    `Area: ${area || 'All tracked areas'}`,
    `Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`
  ].join('\n');
}

async function gasAnswerWithHistory(question, history, context) {
  const snapshot = await fetchGasSnapshot();
  const scenario = resolveGasScenario(question, history, context, snapshot);
  const fuel = scenario.fuelType === 'diesel' ? 'diesel' : 'unleaded';
  const label = fuel === 'diesel' ? 'Diesel' : 'Gasoline 91';
  const stations = getFuelStations(snapshot, fuel, scenario.area);
  const summary = snapshot[fuel];
  const text = normalizeLookupText(question);
  const language = isFilipinoMessage(question) ? 'filipino' : 'english';

  if (text.includes('source') || text.includes('came from') || text.includes('where is the gas price source') || text.includes('saan galing') || text.includes('san galing')) {
    return language === 'filipino'
      ? `Galing ang live fuel prices sa public station feed ng ${snapshot.sourceName}: ${snapshot.sourceUrl}. Current source update: ${snapshot.lastUpdated}.`
      : `Live fuel prices come from the ${snapshot.sourceName} public station feed at ${snapshot.sourceUrl}. Current source update: ${snapshot.lastUpdated}.`;
  }

  if ((text.includes('available') || text.includes('only') || text.includes('ano') || text.includes('saan') || text.includes('san')) &&
    (text.includes('location') || text.includes('locations') || text.includes('area') || text.includes('areas') || text.includes('place') || text.includes('lugar'))) {
    return fuelAreasAnswer(snapshot, language);
  }

  if (!stations.length) {
    if (scenario.area) {
      return language === 'filipino'
        ? `Wala akong nakitang live ${label.toLowerCase()} prices para sa ${scenario.area} ngayon. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`
        : `I couldn't find live ${label.toLowerCase()} prices for ${scenario.area} right now. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
    }
    return language === 'filipino'
      ? 'Hindi available ang live gas prices ngayon.'
      : 'Live gas prices are not available right now.';
  }

  const cheapest = stations[0];
  const highest = stations[stations.length - 1];
  const average = stations.reduce(function(sum, station) {
    return sum + station.price;
  }, 0) / stations.length;

  if (scenario.focus === 'highest') {
    return formatFuelPriceAnswer(label, 'Highest', highest.price, highest.station, highest.area, snapshot, language);
  }

  if (scenario.focus === 'cheapest') {
    return formatFuelPriceAnswer(label, 'Cheapest', cheapest.price, cheapest.station, cheapest.area, snapshot, language);
  }

  if (scenario.area) {
    return language === 'filipino'
      ? `${label} live summary sa ${scenario.area}: average ${formatCurrency(average)}, pinakamura ${formatCurrency(cheapest.price)} sa ${cheapest.station}, pinakamahal ${formatCurrency(highest.price)} sa ${highest.station}. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`
      : `${label} live summary for ${scenario.area}: average ${formatCurrency(average)}, cheapest ${formatCurrency(cheapest.price)} at ${cheapest.station}, highest ${formatCurrency(highest.price)} at ${highest.station}. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
  }

  if (!summary || !summary.cheapest) {
    return language === 'filipino'
      ? 'Hindi available ang live gas prices ngayon.'
      : 'Live gas prices are not available right now.';
  }

  return language === 'filipino'
    ? `${label} live summary: average ${formatCurrency(summary.average)}, pinakamura ${formatCurrency(summary.cheapest.price)} sa ${summary.cheapest.station} (${summary.cheapest.area}), pinakamahal ${formatCurrency(summary.highest.price)} sa ${summary.highest.station} (${summary.highest.area}). Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`
    : `${label} live summary: average ${formatCurrency(summary.average)}, cheapest ${formatCurrency(summary.cheapest.price)} at ${summary.cheapest.station} in ${summary.cheapest.area}, highest ${formatCurrency(summary.highest.price)} at ${summary.highest.station} in ${summary.highest.area}. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
}

function driversAnswer(context) {
  const drivers = currentDriverRecords(context);
  if (!drivers.length) {
    return 'No locally published driver records are available yet. The driver portal can publish a record once the profile is filled in.';
  }

  const names = drivers.slice(0, 3).map(function(driver) {
    return `${driver.name} (${titleCase(driver.vehicleType)} · ${driver.routeLabel})`;
  }).join(', ');
  return `${drivers.length} locally published driver record${drivers.length === 1 ? '' : 's'} found. Example: ${names}.`;
}

function findLastUserMessage(history) {
  if (!Array.isArray(history)) return '';
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index] && history[index].role === 'user') {
      return String(history[index].content || '').trim();
    }
  }
  return '';
}

function sameMessage(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function hasFareLanguage(text) {
  const haystack = normalizedFareText(text);
  return hasFareQuestionLanguage(text) ||
    isOverrunFareQuestion(text) ||
    hasLapRiderLanguage(text) ||
    orderedLocationKeys(haystack).length >= 2;
}

function findRecentFareMessage(history, currentMessage) {
  if (!Array.isArray(history)) return '';

  for (let index = history.length - 1; index >= 0 && index >= history.length - 10; index -= 1) {
    const entry = history[index];
    if (!entry || entry.role !== 'user') continue;

    const content = String(entry.content || '').trim();
    if (!content || sameMessage(content, currentMessage)) continue;
    if (hasFareLanguage(content)) return content;
  }

  return '';
}

function hasRecentAssistantFareAnswer(history) {
  if (!Array.isArray(history)) return false;

  for (let index = history.length - 1; index >= 0 && index >= history.length - 10; index -= 1) {
    const entry = history[index];
    if (!entry || entry.role !== 'assistant') continue;

    const content = String(entry.content || '').toLowerCase();
    if (hasFareAnswerContent(content)) {
      return true;
    }
  }

  return false;
}

function recentSiteContextType(history) {
  if (!Array.isArray(history)) return null;

  for (let index = history.length - 1; index >= 0 && index >= history.length - 14; index -= 1) {
    const entry = history[index];
    if (!entry) continue;

    const content = normalizeLookupText(entry.content || '');
    if (!content) continue;

    if (content.includes('final fare') ||
      content.includes('kabuuang pamasahe') ||
      content.includes('pamasahe sa') ||
      content.includes('calculated from site fare data')) {
      return 'fare';
    }

    if (content.includes('gaswatch') ||
      content.includes('gasoline') ||
      content.includes('diesel') ||
      content.includes('fuel') ||
      content.includes('pinakamurang presyo') ||
      content.includes('grounded fuel data')) {
      return 'gas';
    }

    if (content.includes('fleet') ||
      content.includes('available vehicles') ||
      content.includes('available na') ||
      content.includes('limited') ||
      content.includes('unavailable') ||
      content.includes('grounded fleet data')) {
      return 'vehicle';
    }

    if (content.includes('driver') || content.includes('driver portal')) {
      return 'driver';
    }

    if (content.includes('route') || content.includes('biyahe') || content.includes('destination')) {
      return 'route';
    }
  }

  return null;
}

function isClearlyOutOfScope(message) {
  const text = normalizeLookupText(message);
  return /\b(java|javascript|python|html|css|react|sql|code|coding|program|programming|print in|compiler|algorithm|recipe|cook|cooking|lyrics|movie|anime|game|gaming|basketball|nba|weather forecast|assignment|essay|poem|translate this|summarize this)\b/.test(text);
}

function hasBroadTransportLanguage(message) {
  const text = normalizeLookupText(message);
  return /\b(commute|commuter|transport|transportation|terminal|trip|travel|passenger|public|sakay|sasakay|sakayan|baba|bababa|bababaan|biyahe|byahe|commute|lakad|daan|malapit|nearby|near me|available|limited|unavailable|status|safe|reliable|update|updated|source|valid|estimate|tama|accurate|okay|ayos|mas okay|alin|which|choose|recommend|suggest|kandong|kumandong|kalong|karga|kasama)\b/.test(text);
}

function isContextualSiteFollowUp(message, history) {
  const text = normalizeLookupText(message);
  const contextType = recentSiteContextType(history);

  if (!contextType || isClearlyOutOfScope(message)) return false;
  if (hasBroadTransportLanguage(message)) return true;

  return /^(why|how|how come|what about|how about|what does|what is|which|where|when|can i|can you|is it|is that|does that|explain|compare|recommend|suggest|paano|pano|ano ibig sabihin|bakit|alin|saan|san|pwede|puwede|tama ba|safe ba|okay ba|ayos ba|legit ba|source ba|updated ba|yun ba|ito ba|dyan ba|doon ba|dun ba|what else|ano pa|paki explain|explain mo)\b/.test(text);
}

function isSmallTalk(message) {
  const text = normalizeLookupText(message);
  return /^(hi|hello|hey|yo|wow|nice|cool|great|good morning|good afternoon|good evening|kamusta|kumusta|salamat|thanks|thank you|ty|ok|okay|sige)\b/.test(text) &&
    !hasFareQuestionLanguage(message) &&
    !hasGasLanguage(message) &&
    !isVehicleAvailabilityQuestion(message) &&
    !hasBroadTransportLanguage(message);
}

function detectAssistantIntent(message, history) {
  const question = String(message || '').trim();
  const text = normalizedFareText(question);
  const previousFareMessage = findRecentFareMessage(history, question).toLowerCase();
  const previousUserMessage = (previousFareMessage || findLastUserMessage(history)).toLowerCase();
  const recentGasMessage = findRecentUserMessage(history, hasGasLanguage).toLowerCase();
  const routeMatches = orderedLocationKeys(question);
  const mentionsFare = hasFareQuestionLanguage(question);
  const mentionsFuel = text.includes('gas') ||
    text.includes('fuel') ||
    text.includes('diesel') ||
    text.includes('krudo') ||
    text.includes('gasoline') ||
    text.includes('gasolina') ||
    text.includes('gasolinahan') ||
    text.includes('unleaded');
  const mentionsRoute = text.includes('route') || text.includes('goes to') || text.includes('destination') || text.includes('biyahe');
  const mentionsDriver = text.includes('driver') || text.includes('contact');
  const vehicleAvailability = isVehicleAvailabilityQuestion(question);
  const mentionsVehicle = vehicleAvailability || text.includes('vehicle') || text.includes('sasakyan') || text.includes('available') || text.includes('jeepney') || text.includes('jeep') || text.includes('dyip') || text.includes('jip') || text.includes('bus') || text.includes('tricycle') || text.includes('trike');
  const priorFareContext = Boolean(previousFareMessage) || hasFareQuestionLanguage(previousUserMessage) || hasRecentAssistantFareAnswer(history);
  const passengerFollowUp = hasPassengerCountLanguage(question) || hasPassengerTypeLanguage(question);
  const fareSpecific = /\b(fare|pamasahe|pmasahe|pamasahi|bayad|bayaran|bayran|singil)\b/.test(text);
  const lapRiderFollowUp = priorFareContext && hasLapRiderLanguage(question);
  const fareFollowUp = priorFareContext && (passengerFollowUp || isFareSourceQuestion(question) || /(?:what about|how about|use|using|switch|compare|comparison|vs|versus|cheaper|difference|price|prices|add|plus|another|more|additional|extra|student|estudyante|studyante|regular|senior|pwd|person|people|passengers?|pax|riders?|kami|kaming|tayo|tayong|sasakay|jeep|jeepney|dyip|jip|bus|tricycle|trike|lumagpas|lagpas|lampas|lalagpas|sumobra|sobra)/.test(text));
  const passengerFareQuestion = passengerFollowUp && /(?:eh|pano|paano|pag|kapag|kung|kami|kaming|tayo|tayong|sasakay|sakay|pamasahe|bayad|fare|jeep|jeepney|dyip|jip|bus|tricycle|trike)/.test(text);
  const asksFuelAreas = (text.includes('available') || text.includes('only') || text.includes('ano') || text.includes('saan') || text.includes('san')) &&
    (text.includes('location') || text.includes('locations') || text.includes('area') || text.includes('areas') || text.includes('place') || text.includes('lugar'));
  const priorGasContext = hasGasLanguage(previousUserMessage) || hasGasLanguage(recentGasMessage);
  const gasFollowUp = priorGasContext && (/(?:what about|how about|where|there|that area|that place|station|price|pricing|presyo|magkano|pinakamura|pinakamahal|mura|mahal|saan|san|dyan|doon|dun)/.test(text) || asksFuelAreas || orderedLocationKeys(question).length >= 1);

  if (!question) {
    return 'empty';
  }

  if (isSmallTalk(question)) {
    return 'smalltalk';
  }

  if (mentionsFuel) {
    return 'gas';
  }

  if (vehicleAvailability) {
    return 'vehicle';
  }

  if (gasFollowUp && !fareSpecific && !passengerFareQuestion && routeMatches.length < 2) {
    return 'gas';
  }

  if (mentionsFare || routeMatches.length >= 2 || (routeMatches.length >= 1 && priorFareContext) || fareFollowUp || passengerFareQuestion || lapRiderFollowUp) {
    return 'fare';
  }

  if (gasFollowUp) {
    return 'gas';
  }

  if (mentionsRoute) {
    return 'route';
  }

  if (mentionsDriver) {
    return 'driver';
  }

  if (mentionsVehicle) {
    return 'vehicle';
  }

  if (isContextualSiteFollowUp(question, history)) {
    return 'contextual';
  }

  return 'general';
}

function groundedNoteForIntent(intent) {
  if (intent === 'fare') return 'Calculated from site fare data';
  if (intent === 'gas') return 'Grounded fuel data reply';
  if (intent === 'vehicle') return 'Grounded fleet data reply';
  if (intent === 'route') return 'Grounded route data reply';
  if (intent === 'driver') return 'Grounded driver data reply';
  if (intent === 'smalltalk') return 'spot.ph assistant reply';
  if (intent === 'contextual') return 'Context-aware spot.ph reply';
  return 'Grounded site data reply';
}

function smallTalkAnswer(message) {
  if (isFilipinoMessage(message)) {
    if (/^(wow|nice|cool|great)\b/.test(normalizeLookupText(message))) {
      return 'Nice! Pwede pa kitang tulungan mag-check ng pamasahe, available vehicles, routes, driver records, or gas prices.';
    }
    return 'Hello! Nandito ako para tumulong sa spot.ph: pamasahe, routes, available vehicles, driver records, driver portal, at Cavite gas prices. Ano gusto mong i-check?';
  }

  if (/^(wow|nice|cool|great)\b/.test(normalizeLookupText(message))) {
    return 'Nice! I can keep helping with fares, available vehicles, routes, driver records, or gas prices.';
  }

  return 'Hi! I can help with spot.ph fares, routes, available vehicles, driver records, the driver portal, and Cavite gas prices. What would you like to check?';
}

function assistantScopeAnswer(message) {
  if (isFilipinoMessage(message)) {
    return 'Pwede kitang tulungan sa spot.ph transport topics: pamasahe, routes, available vehicles, driver records, driver portal, at Cavite gas prices. Para accurate, try: "magkano jeep Indang to Trece?" or "ilan available na jeep ngayon?"';
  }

  return 'I can help with spot.ph transport topics: fares, routes, available vehicles, driver records, the driver portal, and Cavite gas prices. Try asking: "How much is the jeepney fare from Indang to Trece?" or "How many jeepneys are available now?"';
}

function contextualSiteAnswer(message, history) {
  const contextType = recentSiteContextType(history);
  const filipino = isFilipinoMessage(message);
  const text = normalizeLookupText(message);

  if (contextType === 'fare') {
    if (/\b(source|updated|reliable|accurate|valid|tama|legit|estimate|galing)\b/.test(text)) {
      return filipino
        ? 'Fare estimate ito mula sa site fare matrix at local distance data. Good siya for planning, pero hindi ito live government fare API, kaya possible pa ring magbago depende sa operator o official fare updates.'
        : 'This is a planning estimate from the site fare matrix and local distance data. It is useful for planning, but it is not a live government fare API, so operators or official updates may still differ.';
    }

    return filipino
      ? 'Oo, pwede nating i-adjust yung fare estimate. Sabihin mo lang kung magbabago ang sakayan, bababaan, vehicle type, o bilang/type ng pasahero.'
      : 'Yes, we can adjust that fare estimate. Tell me if the origin, destination, vehicle type, passenger count, or discount type changes.';
  }

  if (contextType === 'gas') {
    if (/\b(source|updated|reliable|accurate|valid|tama|legit|galing)\b/.test(text)) {
      return filipino
        ? 'Yung gas prices ay galing sa GasWatch PH public station feed. Ipinapakita rin ng reply ang source update date para alam mo kung gaano ka-recent yung snapshot.'
        : 'The gas prices come from the GasWatch PH public station feed. The reply includes the source update date so you can judge how recent the snapshot is.';
    }

    return filipino
      ? 'Sige, tuloy tayo sa gas prices. Pwede mong itanong ang area, fuel type, pinaka mura/mahal, source, o comparison ng presyo.'
      : 'Sure, we can keep checking gas prices. Ask by area, fuel type, cheapest/highest station, source, or price comparison.';
  }

  if (contextType === 'vehicle') {
    if (/\blimited\b/.test(text)) {
      return filipino
        ? 'Ang "limited" ibig sabihin may unit sa route/type na iyon pero hindi full availability. Pwedeng konti lang ang active, may delay, o hindi ideal ang supply kumpara sa available status.'
        : '"Limited" means there are units for that route/type, but availability is not full. It can mean fewer active units, delay risk, or weaker supply than an available status.';
    }

    return filipino
      ? 'Sa vehicle tracking, pwede kong i-check ang available, limited, at unavailable units by vehicle type or route. Sabihin mo lang kung jeep, bus, tricycle, or specific route.'
      : 'For vehicle tracking, I can check available, limited, and unavailable units by vehicle type or route. Tell me jeepney, bus, tricycle, or a specific route.';
  }

  if (contextType === 'driver') {
    return filipino
      ? 'Pwede nating pag-usapan ang driver records, contact details, vehicle registration, o driver portal status gamit ang site data.'
      : 'We can talk through driver records, contact details, vehicle registration, or driver portal status using the site data.';
  }

  if (contextType === 'route') {
    return filipino
      ? 'Pwede kong i-explain ang routes, destinations, vehicle types, at trip planning sa available spot.ph route data.'
      : 'I can explain routes, destinations, vehicle types, and trip planning from the available spot.ph route data.';
  }

  return assistantScopeAnswer(message);
}

async function localAssistantReply(message, context, history) {
  const question = String(message || '').trim();
  const text = question.toLowerCase();
  const intent = detectAssistantIntent(question, history);

  if (intent === 'empty') {
    return 'Ask me about available vehicles, routes, fares, drivers, or gas prices.';
  }

  if (intent === 'smalltalk') {
    return smallTalkAnswer(question);
  }

  if (intent === 'contextual') {
    return contextualSiteAnswer(question, history);
  }

  if (intent === 'gas') {
    return gasAnswerWithHistory(question, history, context);
  }

  if (intent === 'fare') {
    return fareAnswerWithHistory(question, history);
  }

  if (intent === 'route') {
    const route = knowledge.getRouteCatalog().find(function(item) {
      return text.includes(item.id) || text.includes(item.shortLabel.toLowerCase());
    });
    return routeAnswer(route ? route.id : null);
  }

  if (intent === 'driver') {
    return driversAnswer(context);
  }

  if (intent === 'vehicle') {
    return vehiclesAnswer(question, context);
  }

  return assistantScopeAnswer(question);
}

function buildAiSystemPrompt(context, gasSnapshot, groundedContext) {
  const routeSummary = knowledge.getRouteCatalog().map(function(route) {
    return `${route.label}: ${route.origin} to ${route.destination}. Vehicles: ${route.vehicleTypes.join(', ')}.`;
  }).join('\n');

  const fleetSummary = currentFleetSummary(context);
  const fleetText = Object.keys(fleetSummary.byType).map(function(type) {
    const item = fleetSummary.byType[type];
    return `${type}: total ${item.total}, available ${item.available}, limited ${item.limited}, unavailable ${item.unavailable}`;
  }).join('\n');

  const drivers = currentDriverRecords(context).slice(0, 5).map(function(driver) {
    return `${driver.name} | ${driver.routeLabel} | ${titleCase(driver.vehicleType)} | ${driver.contactText}`;
  }).join('\n');

  const gasText = gasSnapshot && gasSnapshot.diesel && gasSnapshot.unleaded
    ? `Diesel average ${formatCurrency(gasSnapshot.diesel.average)}, cheapest ${gasSnapshot.diesel.cheapest ? `${formatCurrency(gasSnapshot.diesel.cheapest.price)} at ${gasSnapshot.diesel.cheapest.station} in ${gasSnapshot.diesel.cheapest.area}` : 'N/A'}.\nGasoline 91 average ${formatCurrency(gasSnapshot.unleaded.average)}, cheapest ${gasSnapshot.unleaded.cheapest ? `${formatCurrency(gasSnapshot.unleaded.cheapest.price)} at ${gasSnapshot.unleaded.cheapest.station} in ${gasSnapshot.unleaded.cheapest.area}` : 'N/A'}.\nFuel source: ${gasSnapshot.sourceName} (${gasSnapshot.sourceUrl}).\nFuel update: ${gasSnapshot.lastUpdated}.`
    : 'Fuel data unavailable.';
  const gasAreaText = gasSnapshot ? fuelAreaPromptSummary(gasSnapshot) : 'Fuel area data unavailable.';

  const fareExamples = [
    knowledge.getFareEstimate('dasma', 'indang', 'jeepney', 'regular'),
    knowledge.getFareEstimate('trece', 'indang', 'jeepney', 'regular'),
    knowledge.getFareEstimate('trece', 'indang', 'bus', 'regular'),
    knowledge.getFareEstimate('alfonso', 'indang', 'bus', 'student'),
    knowledge.getFareEstimate('olivarez', 'indang', 'jeepney', 'senior')
  ].filter(Boolean).map(function(item) {
    return `${titleCase(item.vehicleType)} ${titleCase(item.startLocation)} to ${titleCase(item.destination)} (${item.passengerType}): ${formatCurrency(item.fare)} over ${item.distanceKm} km.`;
  }).join('\n');

  const groundedFacts = groundedContext && groundedContext.answer
    ? [
        `Intent: ${groundedContext.intent || 'general'}.`,
        `Exact grounded answer: ${groundedContext.answer}`
      ].join('\n')
    : 'No exact grounded answer was precomputed for this turn.';

  return [
    'You are the spot.ph assistant for a local public transport site in Cavite, Philippines.',
    'Answer briefly and directly.',
    'Reply in the same language and style as the user when possible, including Tagalog or Taglish.',
    'Only answer questions about spot.ph transport topics: routes, fares, vehicles, driver records, the driver portal, and Cavite gas prices.',
    'If the user asks about unrelated topics, refuse briefly and invite a transport-related question.',
    'Use only the provided context. If the data is not present, say that clearly.',
    'When an exact grounded answer is provided below, treat it as the final authoritative result.',
    'For fare or gas pricing questions with an exact grounded answer, return that grounded answer verbatim and preserve its line breaks and bold markdown exactly.',
    'You may rephrase other grounded answers to sound more natural, but do not change any numbers, route order, passenger counts, prices, statuses, or distances from the grounded answer.',
    'If the user asks for fares, prefer exact estimates from the fare matrix and any grounded fare calculation.',
    'If the user asks for routes or vehicles, answer from the current fleet and route context.',
    '',
    'Routes:',
    routeSummary,
    '',
    'Fleet:',
    fleetText || 'No fleet data available.',
    '',
    'Published drivers:',
    drivers || 'No published drivers.',
    '',
    'Fare matrix examples:',
    fareExamples || 'Fare data unavailable.',
    '',
    'Grounded turn context:',
    groundedFacts,
    '',
    'Fuel snapshot:',
    gasText,
    '',
    'Fuel areas and local examples:',
    gasAreaText
  ].join('\n');
}

async function aiAssistantReply(message, history, context, providerKey, groundedContext) {
  const gasSnapshot = await fetchGasSnapshot().catch(function() {
    return null;
  });
  const systemPrompt = buildAiSystemPrompt(context, gasSnapshot, groundedContext);
  const conversation = Array.isArray(history) ? history.slice(-8) : [];
  const messages = [{ role: 'system', content: systemPrompt }]
    .concat(conversation.map(function(entry) {
      return {
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: String(entry.content || '').slice(0, 1200)
      };
    }))
    .concat([{ role: 'user', content: String(message || '').slice(0, 1600) }]);

  const response = await fetch(pollinationsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerKey}`
    },
    body: JSON.stringify({
      model: 'openai',
      messages,
      temperature: 0.2,
      max_tokens: 280
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI provider returned ${response.status}`);
  }

  const payload = await response.json();
  const answer = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : '';

  if (!answer) {
    throw new Error('AI provider returned an empty response');
  }

  return {
    answer: String(answer).trim(),
    gasSnapshot
  };
}

async function handleAssistantConfig(res) {
  sendJson(res, 200, {
    mode: process.env.POLLINATIONS_KEY ? 'ai' : 'local',
    provider: process.env.POLLINATIONS_KEY ? 'pollinations' : 'local',
    allowBrowserKey: true,
    needsKey: !process.env.POLLINATIONS_KEY,
    keyHint: 'Paste a Pollinations API key to enable real AI chat on this device.'
  });
}

async function handleChat(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const message = String(body.message || '').trim();
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const history = Array.isArray(body.history) ? body.history : [];
    const providerKey = String(body.providerKey || process.env.POLLINATIONS_KEY || '').trim();

    if (!message) {
      sendJson(res, 400, { error: 'Missing message.' });
      return;
    }

    const intent = detectAssistantIntent(message, history);
    const groundedAnswer = intent !== 'general' && intent !== 'empty'
      ? await localAssistantReply(message, context, history)
      : '';

    if (intent === 'general') {
      sendJson(res, 200, {
        mode: 'guarded',
        provider: 'local',
        answer: assistantScopeAnswer(message),
        note: 'Site-related questions only'
      });
      return;
    }

    if (intent === 'smalltalk') {
      sendJson(res, 200, {
        mode: 'local',
        provider: 'local',
        answer: groundedAnswer,
        note: groundedNoteForIntent(intent)
      });
      return;
    }

    if (groundedAnswer && (intent === 'fare' || intent === 'gas')) {
      sendJson(res, 200, {
        mode: 'grounded',
        provider: 'local',
        answer: groundedAnswer,
        note: groundedNoteForIntent(intent)
      });
      return;
    }

    if (providerKey) {
      try {
        const aiReply = await aiAssistantReply(message, history, context, providerKey, groundedAnswer ? {
          intent,
          answer: groundedAnswer
        } : null);
        sendJson(res, 200, {
          mode: 'ai',
          provider: 'pollinations',
          answer: aiReply.answer,
          usedGasSnapshot: Boolean(aiReply.gasSnapshot),
          note: groundedAnswer ? `AI reply grounded with site ${intent} data` : 'Real AI reply'
        });
        return;
      } catch (error) {
        const fallbackAnswer = groundedAnswer || await localAssistantReply(message, context, history);
        sendJson(res, 200, {
          mode: 'local',
          provider: 'local',
          answer: fallbackAnswer,
          note: 'AI mode was unavailable, so the assistant replied from local site data instead.'
        });
        return;
      }
    }

    if (groundedAnswer) {
      sendJson(res, 200, {
        mode: 'grounded',
        provider: 'local',
        answer: groundedAnswer,
        note: groundedNoteForIntent(intent)
      });
      return;
    }

    const localAnswer = await localAssistantReply(message, context, history);
    sendJson(res, 200, {
      mode: 'local',
      provider: 'local',
      answer: localAnswer,
      note: 'Add a Pollinations API key to enable real AI responses.'
    });
  } catch (error) {
    sendJson(res, 500, {
      error: 'Assistant request failed.',
      detail: error && error.message ? error.message : 'Unknown error'
    });
  }
}

function serveStatic(requestPath, res) {
  const requested = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  let filePath = path.resolve(root, requested);

  if (!filePath.startsWith(root)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, function(statErr, stat) {
    if (!statErr && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, function(readErr, data) {
      if (readErr) {
        send(res, 404, 'Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, data, mime[ext] || 'application/octet-stream');
    });
  });
}

const server = http.createServer(function(req, res) {
  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);

  if (req.method === 'GET' && requestUrl.pathname === '/api/assistant/config') {
    handleAssistantConfig(res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/chat') {
    handleChat(req, res);
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(port, '127.0.0.1', function() {
  console.log(`spot.ph server running at http://127.0.0.1:${port}`);
});
