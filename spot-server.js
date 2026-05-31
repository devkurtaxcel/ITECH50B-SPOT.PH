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

function orderedLocationKeys(text) {
  const haystack = String(text || '').toLowerCase();
  const keys = ['indang', 'trece', 'alfonso', 'dasma', 'olivarez'];

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

function hasExplicitPassengerMix(question) {
  const text = String(question || '').toLowerCase();
  return /(\d+)\s*(?:person|people|passengers?|pax|riders?|regulars?|standard(?:\s+passengers?)?|students?|student passengers?|seniors?|senior citizens?|pwds?|pwd passengers?|persons?\s+with\s+disabilit(?:y|ies))/i.test(text) ||
    /\b(student|senior|senior citizen|pwd|person with disability|regular)\b/.test(text);
}

function parsePassengerMix(question) {
  const text = String(question || '').toLowerCase();
  const mix = {
    regular: 0,
    student: 0,
    senior: 0,
    pwd: 0,
    total: 0
  };

  const totalMatch = text.match(/(\d+)\s*(?:person|people|passengers?|pax|riders?)/);
  const totalPassengers = totalMatch ? Number(totalMatch[1]) : 0;

  const typePatterns = {
    regular: /(\d+)\s*(?:more\s+|additional\s+|extra\s+)?(?:regulars?|standard(?:\s+passengers?)?)/g,
    student: /(\d+)\s*(?:more\s+|additional\s+|extra\s+)?(?:students?|student passengers?)/g,
    senior: /(\d+)\s*(?:more\s+|additional\s+|extra\s+)?(?:seniors?|senior citizens?)/g,
    pwd: /(\d+)\s*(?:more\s+|additional\s+|extra\s+)?(?:pwds?|persons?\s+with\s+disabilit(?:y|ies))/g
  };

  Object.keys(typePatterns).forEach(function(type) {
    let match;
    while ((match = typePatterns[type].exec(text)) !== null) {
      mix[type] += Number(match[1]) || 0;
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

function formatPassengerBreakdown(mix, faresByType) {
  return ['regular', 'student', 'senior', 'pwd'].filter(function(type) {
    return mix[type] > 0 && faresByType[type];
  }).map(function(type) {
    const count = mix[type];
    const typeLabel = type === 'pwd' ? 'PWD' : type;
    return `${count} ${typeLabel}${count === 1 ? '' : 's'} at ${formatCurrency(faresByType[type].fare)} each`;
  }).join(', ');
}

function formatPassengerSummary(mix) {
  const parts = [];

  if (mix.student) parts.push(`${mix.student} student${mix.student === 1 ? '' : 's'}`);
  if (mix.regular) parts.push(`${mix.regular} regular${mix.regular === 1 ? '' : 's'}`);
  if (mix.senior) parts.push(`${mix.senior} senior${mix.senior === 1 ? '' : 's'}`);
  if (mix.pwd) parts.push(`${mix.pwd} PWD${mix.pwd === 1 ? '' : 's'}`);

  return parts.join(', ');
}

function detectFuelType(text) {
  const haystack = String(text || '').toLowerCase();
  if (haystack.includes('diesel')) return 'diesel';
  if (haystack.includes('gasoline') || haystack.includes('unleaded') || haystack.includes('gas')) return 'unleaded';
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

function detectGasArea(text, snapshot, selections) {
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

  const selectedArea = selections && selections['fuel-area-select'];
  if (selectedArea && selectedArea !== 'all') {
    return selectedArea;
  }

  return null;
}

function hasGasLanguage(text) {
  const haystack = String(text || '').toLowerCase();
  return haystack.includes('gas') ||
    haystack.includes('fuel') ||
    haystack.includes('diesel') ||
    haystack.includes('gasoline') ||
    haystack.includes('unleaded') ||
    haystack.includes('cheapest') ||
    haystack.includes('station') ||
    haystack.includes('pricing');
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
  const lowered = source.toLowerCase();

  return {
    fuelType: detectFuelType(source),
    area: detectGasArea(source, snapshot, selections),
    focus: lowered.includes('highest') || lowered.includes('most expensive')
      ? 'highest'
      : (lowered.includes('cheapest') || lowered.includes('lowest') || lowered.includes('where')
        ? 'cheapest'
        : 'summary')
  };
}

function resolveGasScenario(question, history, context, snapshot) {
  const selections = context && context.selections ? context.selections : {};
  const previousQuestion = findRecentUserMessage(history, hasGasLanguage) || findLastUserMessage(history);
  const current = gasContextFromText(question, snapshot, selections);
  const previous = previousQuestion ? gasContextFromText(previousQuestion, snapshot, selections) : null;
  const text = String(question || '').toLowerCase();
  const followUp = /(?:what about|how about|there|that one|that area|that place|where)/.test(text);

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

function fuelAreasAnswer(snapshot) {
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
    return `No fuel areas are available from ${snapshot.sourceName} right now. Source update: ${snapshot.lastUpdated}.`;
  }

  return `Available fuel lookup areas from ${snapshot.sourceName}: ${areas.join(', ')}. Source update: ${snapshot.lastUpdated}.`;
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
    hasExplicitPassengerMix: hasExplicitPassengerMix(text)
  };
}

function resolveFareScenario(question, history) {
  const text = String(question || '').toLowerCase();
  const current = extractFareContextFromText(question);
  const previousQuestion = findRecentFareMessage(history, question);
  const previous = previousQuestion ? extractFareContextFromText(previousQuestion) : null;
  const isAdjustment = /(?:add|plus|another|more|additional|extra)\b/.test(text);
  const compareRequested = /(?:compare|comparison|vs|versus|cheaper|cheapest|difference|prices?)/.test(text);
  const locations = current.locations.length >= 2
    ? current.locations
    : (previous && previous.locations.length >= 2 ? previous.locations : current.locations);
  const vehicleType = current.vehicleType || (previous && previous.vehicleType) || 'jeepney';
  let passengerMix = current.hasExplicitPassengerMix || !previous
    ? clonePassengerMix(current.passengerMix)
    : clonePassengerMix(previous.passengerMix);

  if (isAdjustment && previous && previous.passengerMix.total > 0) {
    passengerMix = mergePassengerMix(previous.passengerMix, current.passengerMix);
  } else if (!passengerMix.total && previous && previous.passengerMix.total > 0) {
    passengerMix = clonePassengerMix(previous.passengerMix);
  }

  return {
    locations,
    vehicleType,
    passengerMix,
    compareRequested,
    previousVehicleType: previous && previous.vehicleType ? previous.vehicleType : null
  };
}

function vehiclesAnswer(question, context) {
  const summary = currentFleetSummary(context);
  const text = String(question || '').toLowerCase();
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
    return `${requestedRoute.label} currently has ${matchingEntries.length} ${titleCase(requestedType)} unit${matchingEntries.length === 1 ? '' : 's'} in the site data, with ${availableCount} marked available.`;
  }

  if (requestedType) {
    const typeData = summary.byType[requestedType];
    if (!typeData) {
      return `No ${titleCase(requestedType)} units are listed right now.`;
    }
    return `${titleCase(requestedType)}: ${typeData.total} total, ${typeData.available} available, ${typeData.limited} limited, ${typeData.unavailable} unavailable.`;
  }

  if (requestedRoute) {
    const routeData = summary.byRoute[requestedRoute.id];
    if (!routeData) {
      return `${requestedRoute.label} has no vehicles listed right now.`;
    }
    const mix = Object.keys(routeData.types).map(function(type) {
      return `${titleCase(type)} ${routeData.types[type]}`;
    }).join(', ');
    return `${requestedRoute.label}: ${routeData.total} total, ${routeData.available} available, ${routeData.limited} limited, ${routeData.unavailable} unavailable. Vehicle mix: ${mix}.`;
  }

  return `Current fleet snapshot: ${summary.totals.total} vehicles total, ${summary.totals.available} available, ${summary.totals.limited} limited, and ${summary.totals.unavailable} unavailable.`;
}

function fareAnswer(question) {
  return fareAnswerWithHistory(question, []);
}

function calculateFareDetails(locations, vehicleType, passengerMix) {
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
    breakdown: formatPassengerBreakdown(passengerMix, faresByType),
    summary: formatPassengerSummary(passengerMix)
  };
}

function formatFareDetails(details) {
  const passengerMix = details.passengerMix;
  const baseEstimate = details.baseEstimate;

  if (passengerMix.total <= 1) {
    const passengerType = ['regular', 'student', 'senior', 'pwd'].find(function(type) {
      return passengerMix[type] > 0;
    }) || 'regular';

    return [
      `${titleCase(details.vehicleType)} fare from ${titleCase(baseEstimate.startLocation)} to ${titleCase(baseEstimate.destination)} for a ${passengerType} passenger.`,
      'Final fare',
      `**${formatCurrency(baseEstimate.fare)}**`,
      `Distance: ${baseEstimate.distanceKm} km.`
    ].join('\n');
  }

  return [
    `${titleCase(details.vehicleType)} fare from ${titleCase(baseEstimate.startLocation)} to ${titleCase(baseEstimate.destination)} for ${passengerMix.total} passengers${details.summary ? ` (${details.summary})` : ''}.`,
    'Final fare',
    `**${formatCurrency(details.totalFare)} total**`,
    `Breakdown: ${details.breakdown}.`,
    `Distance: ${baseEstimate.distanceKm} km.`
  ].join('\n');
}

function formatFareComparison(currentDetails, comparisonDetails) {
  const difference = Math.abs(currentDetails.totalFare - comparisonDetails.totalFare);
  const cheaper = currentDetails.totalFare < comparisonDetails.totalFare
    ? currentDetails
    : comparisonDetails;

  const comparisonLines = [
    '',
    'Comparison',
    `${titleCase(comparisonDetails.vehicleType)}: **${formatCurrency(comparisonDetails.totalFare)} total**`,
    `${titleCase(currentDetails.vehicleType)}: **${formatCurrency(currentDetails.totalFare)} total**`
  ];

  if (difference > 0) {
    comparisonLines.push(`${titleCase(cheaper.vehicleType)} is cheaper by **${formatCurrency(difference)}** for this group.`);
  } else {
    comparisonLines.push('Both options cost the same for this group.');
  }

  return `${formatFareDetails(currentDetails)}\n${comparisonLines.join('\n')}`;
}

function fareAnswerWithHistory(question, history) {
  const scenario = resolveFareScenario(question, history);
  const locations = scenario.locations;
  const vehicleType = scenario.vehicleType;
  const passengerMix = scenario.passengerMix;

  if (locations.length >= 2) {
    const details = calculateFareDetails(locations, vehicleType, passengerMix);
    if (!details) {
      return 'I could not find that fare combination in the current fare table.';
    }

    if (scenario.compareRequested) {
      const comparisonType = scenario.previousVehicleType && scenario.previousVehicleType !== vehicleType
        ? scenario.previousVehicleType
        : (vehicleType === 'bus' ? 'jeepney' : 'bus');
      const comparisonDetails = calculateFareDetails(locations, comparisonType, passengerMix);

      if (comparisonDetails) {
        return formatFareComparison(details, comparisonDetails);
      }
    }

    return formatFareDetails(details);
  }

  return 'Ask a fare question with a start and destination, like "How much is the jeepney fare from Indang to Trece?"';
}

async function gasAnswer(question) {
  return gasAnswerWithHistory(question, [], {});
}

function formatFuelPriceAnswer(label, heading, price, station, area, snapshot) {
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
  const text = String(question || '').toLowerCase();

  if (text.includes('source') || text.includes('came from') || text.includes('where is the gas price source')) {
    return `Live fuel prices come from the ${snapshot.sourceName} public station feed at ${snapshot.sourceUrl}. Current source update: ${snapshot.lastUpdated}.`;
  }

  if ((text.includes('available') || text.includes('only')) && (text.includes('location') || text.includes('area') || text.includes('place'))) {
    return fuelAreasAnswer(snapshot);
  }

  if (!stations.length) {
    if (scenario.area) {
      return `I couldn't find live ${label.toLowerCase()} prices for ${scenario.area} right now. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
    }
    return 'Live gas prices are not available right now.';
  }

  const cheapest = stations[0];
  const highest = stations[stations.length - 1];
  const average = stations.reduce(function(sum, station) {
    return sum + station.price;
  }, 0) / stations.length;

  if (scenario.focus === 'highest') {
    return formatFuelPriceAnswer(label, 'Highest', highest.price, highest.station, highest.area, snapshot);
  }

  if (scenario.focus === 'cheapest') {
    return formatFuelPriceAnswer(label, 'Cheapest', cheapest.price, cheapest.station, cheapest.area, snapshot);
  }

  if (scenario.area) {
    return `${label} live summary for ${scenario.area}: average ${formatCurrency(average)}, cheapest ${formatCurrency(cheapest.price)} at ${cheapest.station}, highest ${formatCurrency(highest.price)} at ${highest.station}. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
  }

  if (!summary || !summary.cheapest) {
    return 'Live gas prices are not available right now.';
  }

  return `${label} live summary: average ${formatCurrency(summary.average)}, cheapest ${formatCurrency(summary.cheapest.price)} at ${summary.cheapest.station} in ${summary.cheapest.area}, highest ${formatCurrency(summary.highest.price)} at ${summary.highest.station} in ${summary.highest.area}. Source: ${snapshot.sourceName}. Source update: ${snapshot.lastUpdated}.`;
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
  const haystack = String(text || '').toLowerCase();
  return haystack.includes('fare') ||
    haystack.includes('how much') ||
    haystack.includes('price from') ||
    haystack.includes('pamasahe') ||
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

function detectAssistantIntent(message, history) {
  const question = String(message || '').trim();
  const text = question.toLowerCase();
  const previousFareMessage = findRecentFareMessage(history, question).toLowerCase();
  const previousUserMessage = (previousFareMessage || findLastUserMessage(history)).toLowerCase();
  const recentGasMessage = findRecentUserMessage(history, hasGasLanguage).toLowerCase();
  const routeMatches = orderedLocationKeys(question);
  const mentionsFare = text.includes('fare') || text.includes('how much') || text.includes('price from') || text.includes('pamasahe');
  const mentionsFuel = text.includes('gas') || text.includes('fuel') || text.includes('diesel') || text.includes('gasoline') || text.includes('unleaded');
  const mentionsRoute = text.includes('route') || text.includes('goes to') || text.includes('destination') || text.includes('biyahe');
  const mentionsDriver = text.includes('driver') || text.includes('contact');
  const mentionsVehicle = text.includes('vehicle') || text.includes('available') || text.includes('jeepney') || text.includes('bus') || text.includes('tricycle');
  const priorFareContext = Boolean(previousFareMessage) || previousUserMessage.includes('fare') || previousUserMessage.includes('how much') || previousUserMessage.includes('price from') || previousUserMessage.includes('pamasahe');
  const fareFollowUp = priorFareContext && (/(?:what about|how about|use|using|switch|compare|comparison|vs|versus|cheaper|difference|price|prices|add|plus|another|more|additional|extra|student|regular|senior|pwd|person|people|passengers?|pax|riders?|jeep|jeepney|bus|tricycle)/.test(text));
  const asksFuelAreas = (text.includes('available') || text.includes('only')) && (text.includes('location') || text.includes('area') || text.includes('place'));
  const priorGasContext = hasGasLanguage(previousUserMessage) || hasGasLanguage(recentGasMessage);
  const gasFollowUp = priorGasContext && (/(?:what about|how about|where|there|that area|that place|station|price|pricing)/.test(text) || asksFuelAreas || orderedLocationKeys(question).length >= 1);

  if (!question) {
    return 'empty';
  }

  if (mentionsFuel) {
    return 'gas';
  }

  if (gasFollowUp) {
    return 'gas';
  }

  if (mentionsFare || routeMatches.length >= 2 || (routeMatches.length >= 1 && priorFareContext) || fareFollowUp) {
    return 'fare';
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

  return 'general';
}

function groundedNoteForIntent(intent) {
  if (intent === 'fare') return 'Calculated from site fare data';
  if (intent === 'gas') return 'Grounded fuel data reply';
  if (intent === 'vehicle') return 'Grounded fleet data reply';
  if (intent === 'route') return 'Grounded route data reply';
  if (intent === 'driver') return 'Grounded driver data reply';
  return 'Grounded site data reply';
}

function assistantScopeAnswer() {
  return 'I can only help with spot.ph transport topics: routes, fares, available vehicles, driver records, the driver portal, and Cavite gas prices.';
}

async function localAssistantReply(message, context, history) {
  const question = String(message || '').trim();
  const text = question.toLowerCase();
  const intent = detectAssistantIntent(question, history);

  if (intent === 'empty') {
    return 'Ask me about available vehicles, routes, fares, drivers, or gas prices.';
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

  return assistantScopeAnswer();
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
        answer: assistantScopeAnswer(),
        note: 'Site-related questions only'
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
