(function() {
  const DRIVER_PROFILE_KEY = 'spot-driver-profile';
  const defaultCoordinates = { lat: 14.196784, lng: 120.8778175 };
  const routeCenters = {
    indang: { lat: 14.196784, lng: 120.8778175 },
    dasma: { lat: 14.3014304, lng: 120.9540319 },
    trece: { lat: 14.2811316, lng: 120.8682973 },
    alfonso: { lat: 14.1339817, lng: 120.8584547 },
    olivarez: { lat: 14.1173074, lng: 120.9618944 }
  };

  function safeRead(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function defaultProfile() {
    return {
      id: 'driver-local-1',
      name: '',
      phone: '',
      emergencyContact: '',
      route: 'trece',
      vehicleType: 'jeepney',
      plateNumber: '',
      vehicleModel: '',
      vehicleColor: '',
      seatCapacity: 18,
      seatsAvailable: 18,
      operatorName: '',
      schedule: '5:00 AM - 9:00 PM',
      terminal: 'Indang Transport Terminal',
      status: 'available',
      publicVisible: true,
      gpsSharing: false,
      lastTripTime: '',
      location: {
        lat: defaultCoordinates.lat,
        lng: defaultCoordinates.lng,
        updatedAt: ''
      },
      publicNote: 'Open for passenger inquiries and route coordination.',
      bio: 'Local route operator using the spot.ph prototype driver panel.',
      updatedAt: ''
    };
  }

  function cleanNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function normalizeStatus(value) {
    return ['available', 'limited', 'unavailable'].includes(value) ? value : 'available';
  }

  function normalizeRoute(value) {
    return Object.prototype.hasOwnProperty.call(routeCenters, value) ? value : 'trece';
  }

  function normalizeVehicleType(value) {
    return ['jeepney', 'bus', 'tricycle'].includes(value) ? value : 'jeepney';
  }

  function normalizeProfile(rawProfile) {
    const base = defaultProfile();
    const input = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    const route = normalizeRoute(input.route || base.route);
    const fallbackCenter = routeCenters[route] || defaultCoordinates;
    const locationInput = input.location && typeof input.location === 'object' ? input.location : {};

    return {
      id: String(input.id || base.id),
      name: String(input.name || '').trim(),
      phone: String(input.phone || '').trim(),
      emergencyContact: String(input.emergencyContact || '').trim(),
      route: route,
      vehicleType: normalizeVehicleType(input.vehicleType || base.vehicleType),
      plateNumber: String(input.plateNumber || '').trim().toUpperCase(),
      vehicleModel: String(input.vehicleModel || '').trim(),
      vehicleColor: String(input.vehicleColor || '').trim(),
      seatCapacity: Math.max(1, cleanNumber(input.seatCapacity, base.seatCapacity)),
      seatsAvailable: Math.max(0, cleanNumber(input.seatsAvailable, base.seatsAvailable)),
      operatorName: String(input.operatorName || '').trim(),
      schedule: String(input.schedule || base.schedule).trim(),
      terminal: String(input.terminal || base.terminal).trim(),
      status: normalizeStatus(input.status || base.status),
      publicVisible: input.publicVisible !== false,
      gpsSharing: Boolean(input.gpsSharing),
      lastTripTime: String(input.lastTripTime || '').trim(),
      location: {
        lat: cleanNumber(locationInput.lat, fallbackCenter.lat),
        lng: cleanNumber(locationInput.lng, fallbackCenter.lng),
        updatedAt: String(locationInput.updatedAt || '')
      },
      publicNote: String(input.publicNote || base.publicNote).trim(),
      bio: String(input.bio || base.bio).trim(),
      updatedAt: String(input.updatedAt || '')
    };
  }

  function loadDriverProfile() {
    const raw = safeRead(DRIVER_PROFILE_KEY);
    if (!raw) return defaultProfile();

    try {
      return normalizeProfile(JSON.parse(raw));
    } catch (error) {
      return defaultProfile();
    }
  }

  function saveDriverProfile(profile) {
    const nextProfile = normalizeProfile({
      ...loadDriverProfile(),
      ...(profile || {}),
      updatedAt: new Date().toISOString()
    });
    safeWrite(DRIVER_PROFILE_KEY, JSON.stringify(nextProfile));
    return nextProfile;
  }

  function getRouteCenter(route) {
    return routeCenters[normalizeRoute(route)] || defaultCoordinates;
  }

  function buildDriverInitials(name) {
    const tokens = String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (!tokens.length) return 'DR';
    return tokens.map(function(token) {
      return token.charAt(0).toUpperCase();
    }).join('');
  }

  function getPublishedDriverRecords() {
    const profile = loadDriverProfile();
    const hasPublicRecord = profile.publicVisible && profile.name && profile.phone && profile.plateNumber;
    if (!hasPublicRecord) return [];

    return [{
      id: profile.id,
      initials: buildDriverInitials(profile.name),
      name: profile.name,
      vehicleType: profile.vehicleType,
      plateNumber: profile.plateNumber,
      route: profile.route,
      routeLabel: profile.route.charAt(0).toUpperCase() + profile.route.slice(1) + ' Route',
      contactText: profile.phone,
      contactHref: profile.phone ? 'tel:' + profile.phone.replace(/[^\d+]/g, '') : '',
      schedule: profile.schedule,
      lastTripTime: profile.lastTripTime || 'Live via portal',
      status: profile.status,
      publicNote: profile.publicNote,
      operatorName: profile.operatorName,
      terminal: profile.terminal,
      seatsAvailable: profile.seatsAvailable,
      seatCapacity: profile.seatCapacity,
      vehicleModel: profile.vehicleModel,
      vehicleColor: profile.vehicleColor,
      emergencyContact: profile.emergencyContact,
      location: {
        lat: profile.location.lat,
        lng: profile.location.lng,
        updatedAt: profile.location.updatedAt
      }
    }];
  }

  function getDashboardDriverEntries() {
    return getPublishedDriverRecords().map(function(record) {
      const fallbackCenter = getRouteCenter(record.route);
      return {
        id: record.id,
        driverName: record.name,
        route: record.route,
        type: record.vehicleType,
        status: record.status,
        lat: cleanNumber(record.location && record.location.lat, fallbackCenter.lat),
        lng: cleanNumber(record.location && record.location.lng, fallbackCenter.lng)
      };
    });
  }

  window.spotDataStore = {
    defaultProfile,
    loadDriverProfile,
    saveDriverProfile,
    getPublishedDriverRecords,
    getDashboardDriverEntries,
    getRouteCenter
  };
})();
