(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.spotKnowledgeBase = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const routeCenters = {
    indang: { lat: 14.196784, lng: 120.8778175 },
    dasma: { lat: 14.3014304, lng: 120.9540319 },
    trece: { lat: 14.2811316, lng: 120.8682973 },
    alfonso: { lat: 14.1339817, lng: 120.8584547 },
    olivarez: { lat: 14.1173074, lng: 120.9618944 }
  };

  const routeCatalog = [
    {
      id: 'dasma',
      label: 'Dasma Route',
      shortLabel: 'Dasma',
      origin: 'Indang Transport Terminal',
      destination: 'Pala Pala Transportation Terminal, Dasmariñas',
      vehicleTypes: ['jeepney', 'bus'],
      summary: 'Main route between Indang and Dasmariñas for daily commuters.'
    },
    {
      id: 'trece',
      label: 'Trece Route',
      shortLabel: 'Trece',
      origin: 'Indang Transport Terminal',
      destination: 'Trece Martires',
      vehicleTypes: ['jeepney', 'bus', 'tricycle'],
      summary: 'Common route for civic, school, and office trips to Trece Martires.'
    },
    {
      id: 'alfonso',
      label: 'Alfonso Route',
      shortLabel: 'Alfonso',
      origin: 'Indang Transport Terminal',
      destination: 'Alfonso',
      vehicleTypes: ['jeepney', 'bus'],
      summary: 'Route serving the Indang to Alfonso corridor.'
    },
    {
      id: 'olivarez',
      label: 'Olivarez Route',
      shortLabel: 'Olivarez',
      origin: 'Indang Transport Terminal',
      destination: 'Olivarez Plaza, Tagaytay',
      vehicleTypes: ['jeepney', 'bus'],
      summary: 'Route connecting Indang to the Olivarez and Tagaytay area.'
    }
  ];

  const distanceData = {
    trece: { trece: 0, alfonso: 25, dasma: 35, indang: 10, olivarez: 40, gma: 22, silang: 28, carmona: 30 },
    alfonso: { trece: 25, alfonso: 0, dasma: 30, indang: 18, olivarez: 22, gma: 45, silang: 30, carmona: 48 },
    dasma: { trece: 35, alfonso: 30, dasma: 0, indang: 18, olivarez: 45, gma: 14, silang: 15, carmona: 18 },
    indang: { trece: 10, alfonso: 18, dasma: 18, indang: 0, olivarez: 30, gma: 30, silang: 32, carmona: 38 },
    olivarez: { trece: 40, alfonso: 22, dasma: 45, indang: 30, olivarez: 0, gma: 34, silang: 18, carmona: 36 },
    gma: { trece: 22, alfonso: 45, dasma: 14, indang: 30, olivarez: 34, gma: 0, silang: 16, carmona: 6 },
    silang: { trece: 28, alfonso: 30, dasma: 15, indang: 32, olivarez: 18, gma: 16, silang: 0, carmona: 18 },
    carmona: { trece: 30, alfonso: 48, dasma: 18, indang: 38, olivarez: 36, gma: 6, silang: 18, carmona: 0 }
  };

  const locationLabels = {
    indang: 'Indang',
    trece: 'Trece',
    alfonso: 'Alfonso',
    dasma: 'Dasma',
    olivarez: 'Olivarez',
    gma: 'GMA',
    silang: 'Silang',
    carmona: 'Carmona'
  };

  const passengerAliases = {
    regular: ['regular', 'standard', 'normal'],
    student: ['student', 'estudyante', 'studyante', 'sestudyante', 'estudiante', 'estudyanti'],
    senior: ['senior', 'senior citizen', 'sc', 'senyor'],
    pwd: ['pwd', 'person with disability', 'disabled']
  };

  const baseFleet = [
    {
      id: 'fleet-jeepney-dasma-1',
      route: 'dasma',
      type: 'jeepney',
      status: 'available',
      driverName: 'Mario Santos',
      lat: 14.2356,
      lng: 120.9052,
      source: 'demo'
    },
    {
      id: 'fleet-jeepney-trece-1',
      route: 'trece',
      type: 'jeepney',
      status: 'limited',
      driverName: 'Paolo Reyes',
      lat: 14.2394,
      lng: 120.8748,
      source: 'demo'
    },
    {
      id: 'fleet-jeepney-olivarez-1',
      route: 'olivarez',
      type: 'jeepney',
      status: 'available',
      driverName: 'Cesar Molina',
      lat: 14.1524,
      lng: 120.9324,
      source: 'demo'
    },
    {
      id: 'fleet-bus-dasma-1',
      route: 'dasma',
      type: 'bus',
      status: 'available',
      driverName: 'Ruben Bautista',
      lat: 14.2662,
      lng: 120.9338,
      source: 'demo'
    },
    {
      id: 'fleet-bus-alfonso-1',
      route: 'alfonso',
      type: 'bus',
      status: 'unavailable',
      driverName: 'Ana Rivera',
      lat: 14.1471,
      lng: 120.8667,
      source: 'demo'
    },
    {
      id: 'fleet-tricycle-trece-1',
      route: 'trece',
      type: 'tricycle',
      status: 'available',
      driverName: 'Leo Mercado',
      lat: 14.2216,
      lng: 120.8827,
      source: 'demo'
    }
  ];

  function titleCase(value) {
    return String(value || '')
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(function(token) {
        return token.charAt(0).toUpperCase() + token.slice(1);
      })
      .join(' ');
  }

  function normalizeRoute(value) {
    return Object.prototype.hasOwnProperty.call(routeCenters, value) ? value : 'trece';
  }

  function normalizeVehicleType(value) {
    return ['jeepney', 'bus', 'tricycle'].includes(value) ? value : 'jeepney';
  }

  function normalizeStatus(value) {
    return ['available', 'limited', 'unavailable'].includes(value) ? value : 'available';
  }

  function getRouteCenter(route) {
    return routeCenters[normalizeRoute(route)];
  }

  function getRouteCatalog() {
    return routeCatalog.map(function(route) {
      return { ...route };
    });
  }

  function getBaseFleet() {
    return baseFleet.map(function(entry) {
      return { ...entry };
    });
  }

  function calculateProvincialAircon(distance, passengerType) {
    const baseRate = 2.10;
    let fare = baseRate * distance;
    if (passengerType !== 'regular') fare = fare * 0.8;
    return Math.round(fare * 4) / 4;
  }

  function calculateTraditionalJeepney(distance, passengerType) {
    const isDiscount = passengerType !== 'regular';
    let fare;
    if (distance <= 4) {
      fare = isDiscount ? 10.4 : 13.0;
    } else {
      const baseFare = isDiscount ? 10.4 : 13.0;
      const ratePerKm = isDiscount ? 1.44 : 1.8;
      fare = baseFare + (ratePerKm * (distance - 4));
    }
    return Math.round(fare * 4) / 4;
  }

  function calculateTricycle(distance) {
    return Math.round(distance * 12 * 4) / 4;
  }

  function getFareEstimate(startLocation, destination, vehicleType, passengerType) {
    const from = String(startLocation || '').toLowerCase();
    const to = String(destination || '').toLowerCase();
    const mode = normalizeVehicleType(vehicleType);
    const riderType = ['regular', 'student', 'senior', 'pwd'].includes(passengerType) ? passengerType : 'regular';

    if (!distanceData[from] || typeof distanceData[from][to] !== 'number') {
      return null;
    }

    const distance = distanceData[from][to];
    let fare = null;

    if (mode === 'bus') {
      fare = calculateProvincialAircon(distance, riderType);
    } else if (mode === 'jeepney') {
      fare = calculateTraditionalJeepney(distance, riderType);
    } else if (mode === 'tricycle') {
      fare = calculateTricycle(distance);
    }

    if (typeof fare !== 'number' || Number.isNaN(fare)) return null;
    if (fare < 15) fare = 15;

    return {
      startLocation: from,
      destination: to,
      vehicleType: mode,
      passengerType: riderType,
      distanceKm: distance,
      fare: Math.round(fare)
    };
  }

  function getPublishedDrivers() {
    if (!root || !root.spotDataStore || typeof root.spotDataStore.getPublishedDriverRecords !== 'function') {
      return [];
    }
    return root.spotDataStore.getPublishedDriverRecords().map(function(record) {
      return { ...record };
    });
  }

  function toFleetEntryFromDriver(record) {
    const center = getRouteCenter(record.route);
    return {
      id: record.id,
      route: normalizeRoute(record.route),
      type: normalizeVehicleType(record.vehicleType),
      status: normalizeStatus(record.status),
      driverName: record.name || '',
      lat: Number(record.location && record.location.lat) || center.lat,
      lng: Number(record.location && record.location.lng) || center.lng,
      source: 'portal'
    };
  }

  function getFleetSnapshot(options) {
    const config = options && typeof options === 'object' ? options : {};
    const publishedDrivers = Array.isArray(config.publishedDrivers)
      ? config.publishedDrivers
      : getPublishedDrivers();

    return getBaseFleet().concat(
      publishedDrivers.map(toFleetEntryFromDriver)
    );
  }

  function getFleetSummary(snapshot) {
    const fleet = Array.isArray(snapshot) ? snapshot : [];
    const byType = {};
    const byRoute = {};
    const totals = { total: 0, available: 0, limited: 0, unavailable: 0 };

    fleet.forEach(function(entry) {
      const type = normalizeVehicleType(entry.type);
      const route = normalizeRoute(entry.route);
      const status = normalizeStatus(entry.status);

      totals.total += 1;
      totals[status] += 1;

      if (!byType[type]) {
        byType[type] = { total: 0, available: 0, limited: 0, unavailable: 0, routes: {} };
      }
      if (!byRoute[route]) {
        byRoute[route] = { total: 0, available: 0, limited: 0, unavailable: 0, types: {} };
      }

      byType[type].total += 1;
      byType[type][status] += 1;
      byType[type].routes[route] = (byType[type].routes[route] || 0) + 1;

      byRoute[route].total += 1;
      byRoute[route][status] += 1;
      byRoute[route].types[type] = (byRoute[route].types[type] || 0) + 1;
    });

    return { totals, byType, byRoute };
  }

  function findLocationKey(text) {
    const matches = findAllLocationKeys(text);
    return matches.length ? matches[0] : null;
  }

  function findAllLocationKeys(text) {
    const haystack = String(text || '').toLowerCase();
    return Object.keys(locationLabels).map(function(key) {
      const aliases = [key, String(locationLabels[key]).toLowerCase()];
      const positions = aliases.map(function(alias) {
        return haystack.indexOf(alias);
      }).filter(function(position) {
        return position >= 0;
      });

      if (!positions.length) return null;

      return {
        key,
        index: Math.min.apply(Math, positions)
      };
    }).filter(Boolean).sort(function(a, b) {
      return a.index - b.index;
    }).map(function(entry) {
      return entry.key;
    });
  }

  function detectVehicleType(text) {
    const haystack = String(text || '').toLowerCase();
    if (haystack.includes('tricycle') || haystack.includes('trike') || haystack.includes('tric')) return 'tricycle';
    if (haystack.includes('bus')) return 'bus';
    if (haystack.includes('jeep') || haystack.includes('jeepney') || haystack.includes('dyip') || haystack.includes('jip')) return 'jeepney';
    return null;
  }

  function detectPassengerType(text) {
    const haystack = String(text || '').toLowerCase();
    return Object.keys(passengerAliases).find(function(type) {
      return passengerAliases[type].some(function(alias) {
        return haystack.includes(alias);
      });
    }) || 'regular';
  }

  function formatCurrency(value) {
    return 'PHP ' + Number(value || 0).toFixed(2);
  }

  return {
    routeCenters,
    locationLabels,
    getRouteCatalog,
    getBaseFleet,
    getRouteCenter,
    getPublishedDrivers,
    getFleetSnapshot,
    getFleetSummary,
    getFareEstimate,
    calculateTricycle,
    titleCase,
    normalizeRoute,
    normalizeVehicleType,
    normalizeStatus,
    findLocationKey,
    findAllLocationKeys,
    detectVehicleType,
    detectPassengerType,
    formatCurrency,
    distanceData
  };
});
