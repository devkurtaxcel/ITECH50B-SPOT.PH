document.addEventListener('DOMContentLoaded', function() {
  const defaultCenter = { lat: 14.197070883599935, lng: 120.87755168813959 };
  const defaultZoom = 14;
  const sharedStore = window.spotDataStore || null;
  const knowledgeBase = window.spotKnowledgeBase || null;
  const markers = [];
  const routeSelect = document.getElementById('route-select');
  const vehicleSelect = document.getElementById('vehicle-select');
  const vehiclesList = document.getElementById('vehicles-list');
  const timetableCards = document.querySelectorAll('.timetable-card');
  const showLocationBtn = document.getElementById('show-location-btn');
  const vehicleSummary = document.getElementById('vehicle-summary');
  const vehicleSummaryCaption = document.getElementById('vehicle-summary-caption');
  const routeOrder = ['dasma', 'trece', 'alfonso', 'olivarez'];
  const vehicleTypes = ['jeepney', 'bus', 'tricycle'];
  let mapInstance = null;
  let userMarker = null;
  let terminalMarker = null;
  let movementInterval = null;
  let statusInterval = null;

  function titleCase(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function statusLabel(status) {
    return titleCase(status);
  }

  function dominantStatus(stats) {
    if (!stats || !stats.total) return 'unavailable';
    if (stats.available >= stats.limited && stats.available >= stats.unavailable && stats.available > 0) return 'available';
    if (stats.limited >= stats.unavailable && stats.limited > 0) return 'limited';
    return 'unavailable';
  }

  function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') {
      return null;
    }

    const map = L.map('map').setView([defaultCenter.lat, defaultCenter.lng], defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    map.zoomControl.setPosition('topright');
    return map;
  }

  function colorForType(type) {
    switch ((type || '').toLowerCase()) {
      case 'pub':
        return '#1f78b4';
      case 'puj':
        return '#33a02c';
      case 'tricycle':
        return '#ff7f00';
      case 'bus':
        return '#6a3d9a';
      case 'van':
        return '#e31a1c';
      default:
        return '#666666';
    }
  }

  function updatePopup(markerData) {
    if (!markerData.marker) return;
    const driverLine = markerData.driverName ? `<br>Driver: ${markerData.driverName}` : '';
    const sourceLine = markerData.source === 'portal' ? '<br>Source: Driver portal sync' : '';
    markerData.marker.bindPopup(`<strong>${markerData.route.toUpperCase()} Route</strong><br>Type: ${titleCase(markerData.type)}<br>Status: ${statusLabel(markerData.status)}${driverLine}${sourceLine}`);
  }

  function updateCardContent(markerData) {
    if (!markerData.card) return;
    const statusEl = markerData.card.querySelector('.vehicle-status');
    const infoText = markerData.card.querySelector('.vehicle-info p');
    if (statusEl) {
      statusEl.className = `vehicle-status ${markerData.status}`;
      statusEl.textContent = '';
      statusEl.setAttribute('title', statusLabel(markerData.status));
    }
    if (infoText) {
      infoText.textContent = markerData.driverName
        ? `${markerData.driverName} · ${titleCase(markerData.type)} · ${statusLabel(markerData.status)}`
        : `${titleCase(markerData.type)} - Status: ${statusLabel(markerData.status)}`;
    }
  }

  function createCard(markerData) {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.setAttribute('data-route', markerData.route);
    card.setAttribute('data-vehicles', markerData.type);
    const detail = markerData.driverName
      ? `${markerData.driverName} · ${titleCase(markerData.type)} · ${statusLabel(markerData.status)}`
      : `${titleCase(markerData.type)} - Status: ${statusLabel(markerData.status)}`;
    card.innerHTML = `
      <div class="vehicle-status ${markerData.status}" aria-hidden="true"></div>
      <div class="vehicle-info">
        <h4>${titleCase(markerData.route)} Route</h4>
        <p>${detail}</p>
      </div>
    `;
    return card;
  }

  function createVehicleData() {
    markers.length = 0;
    if (vehiclesList) vehiclesList.innerHTML = '';
    const fleetEntries = knowledgeBase && typeof knowledgeBase.getFleetSnapshot === 'function'
      ? knowledgeBase.getFleetSnapshot()
      : [];

    fleetEntries.forEach(function(entry, index) {
      const markerData = {
        id: entry.id || `veh_${index}`,
        marker: null,
        lat: Number(entry.lat) || defaultCenter.lat,
        lng: Number(entry.lng) || defaultCenter.lng,
        color: colorForType(entry.type === 'bus' ? 'pub' : (entry.type === 'jeepney' ? 'puj' : 'tricycle')),
        route: entry.route,
        type: entry.type,
        status: entry.status,
        vehicles: [entry.type],
        card: null,
        driverName: entry.driverName || '',
        source: entry.source || 'demo'
      };

      markerData.card = createCard(markerData);
      if (vehiclesList) vehiclesList.appendChild(markerData.card);
      markers.push(markerData);
    });

    window.spotDashboardState = {
      getMarkers: function() {
        return markers.map(function(markerData) {
          return {
            id: markerData.id,
            route: markerData.route,
            type: markerData.type,
            status: markerData.status,
            driverName: markerData.driverName,
            source: markerData.source
          };
        });
      }
    };

    renderVehicleSummary();
  }

  function hydrateMapMarkers(map) {
    const bounds = [];

    markers.forEach(function(markerData) {
      if (!markerData.marker) {
        markerData.marker = L.circleMarker([markerData.lat, markerData.lng], {
          radius: 7,
          color: markerData.color,
          weight: 1,
          fillColor: markerData.color,
          fillOpacity: 0.95
        }).addTo(map);
        updatePopup(markerData);
      } else if (!map.hasLayer(markerData.marker)) {
        markerData.marker.addTo(map);
      }

      bounds.push([markerData.lat, markerData.lng]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    applyFilters();
  }

  function renderVehicleSummary() {
    if (!vehicleSummary) return;

    const selectedRoute = routeSelect && routeSelect.value ? routeSelect.value : 'all';
    const selectedVehicle = vehicleSelect && vehicleSelect.value ? vehicleSelect.value : 'all';
    const countsAll = {};
    const countsFiltered = {};

    markers.forEach(function(markerData) {
      const type = markerData.type.toLowerCase();
      const route = markerData.route.toLowerCase();
      if (!countsAll[type]) {
        countsAll[type] = { total: 0, available: 0, limited: 0, unavailable: 0, perRoute: {} };
      }
      countsAll[type].total += 1;
      countsAll[type][markerData.status] += 1;
      countsAll[type].perRoute[route] = (countsAll[type].perRoute[route] || 0) + 1;

      if (selectedRoute !== 'all' && route !== selectedRoute) return;
      if (selectedVehicle !== 'all' && type !== selectedVehicle) return;

      if (!countsFiltered[type]) {
        countsFiltered[type] = { total: 0, available: 0, limited: 0, unavailable: 0 };
      }
      countsFiltered[type].total += 1;
      countsFiltered[type][markerData.status] += 1;
    });

    vehicleSummary.innerHTML = '';

    if (!Object.keys(countsAll).length) {
      vehicleSummary.classList.remove('fleet-summary-grid--single');
      vehicleSummary.innerHTML = '<div class="fleet-summary-empty" role="listitem">No vehicle data available at the moment.</div>';
      return;
    }

    if (vehicleSummaryCaption) {
      const routeText = selectedRoute === 'all' ? 'All Routes' : titleCase(selectedRoute);
      const vehicleText = selectedVehicle === 'all' ? 'All Vehicles' : titleCase(selectedVehicle);
      vehicleSummaryCaption.textContent = `Showing ${routeText} for ${vehicleText}.`;
    }

    const typesToRender = selectedVehicle === 'all'
      ? vehicleTypes.slice()
      : vehicleTypes.filter(function(type) { return type === selectedVehicle; });

    typesToRender.forEach(function(type) {
      const statAll = countsAll[type] || { total: 0, available: 0, limited: 0, unavailable: 0, perRoute: {} };
      const statFiltered = countsFiltered[type] || { total: 0, available: 0, limited: 0, unavailable: 0 };
      const isActive = selectedVehicle === type;
      const emphasis = dominantStatus(statFiltered.total ? statFiltered : statAll);
      const card = document.createElement('article');
      card.className = `fleet-summary-card fleet-summary-card--${emphasis}${isActive ? ' is-active' : ''}`;
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <div class="fleet-summary-card__head">
          <div class="fleet-summary-card__title-wrap">
            <span class="fleet-summary-card__eyebrow">Vehicle Type</span>
            <h4 class="fleet-summary-card__title">${titleCase(type)}</h4>
            <p class="fleet-summary-card__subtext">${selectedRoute === 'all' ? 'System-wide live total' : `${titleCase(selectedRoute)} live total`}</p>
          </div>
          <div class="fleet-summary-card__total">
            <span>Total</span>
            <strong>${statFiltered.total}</strong>
          </div>
        </div>
        <div class="fleet-summary-card__stats">
          <div class="fleet-summary-stat fleet-summary-stat--available">
            <span>Available</span>
            <strong>${statFiltered.available}</strong>
          </div>
          <div class="fleet-summary-stat fleet-summary-stat--limited">
            <span>Limited</span>
            <strong>${statFiltered.limited}</strong>
          </div>
          <div class="fleet-summary-stat fleet-summary-stat--unavailable">
            <span>Unavailable</span>
            <strong>${statFiltered.unavailable}</strong>
          </div>
        </div>
        <div class="fleet-summary-card__routes">
          ${routeOrder.map(function(route) {
            const routeCount = statAll.perRoute[route] || 0;
            const selectedClass = selectedRoute === route ? ' is-selected' : '';
            return `
              <div class="fleet-route-pill${selectedClass}">
                <span>${titleCase(route)}</span>
                <strong>${routeCount}</strong>
              </div>
            `;
          }).join('')}
        </div>
        <div class="fleet-summary-card__footer">
          <p class="fleet-summary-card__note">${selectedRoute === 'all' ? 'Route allocation across the full network.' : 'Highlighted route matches the current route filter.'}</p>
          <button class="table-filter-btn${isActive ? ' is-active' : ''}" data-type="${type}" type="button" aria-pressed="${isActive}">
            ${isActive ? 'Show All' : 'Focus Type'}
          </button>
        </div>
      `;
      vehicleSummary.appendChild(card);
    });

    vehicleSummary.classList.toggle('fleet-summary-grid--single', typesToRender.length === 1);

    vehicleSummary.querySelectorAll('.table-filter-btn').forEach(function(button) {
      button.addEventListener('click', function() {
        const nextType = button.getAttribute('data-type');
        const isActive = vehicleSelect && vehicleSelect.value === nextType;
        if (vehicleSelect) vehicleSelect.value = isActive ? 'all' : nextType;
        applyFilters();
        renderVehicleSummary();
        if (vehiclesList) vehiclesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function simulateMovement() {
    const jitter = 0.0007;
    markers.forEach(function(markerData) {
      markerData.lat += (Math.random() - 0.5) * jitter;
      markerData.lng += (Math.random() - 0.5) * jitter;
      if (markerData.marker) {
        markerData.marker.setLatLng([markerData.lat, markerData.lng]);
      }
    });
  }

  function updateMarkersVisibility(selectedRoute, selectedVehicle) {
    markers.forEach(function(markerData) {
      if (!markerData.marker) return;
      let show = true;
      if (selectedRoute !== 'all' && markerData.route !== selectedRoute) show = false;
      if (selectedVehicle !== 'all' && markerData.type !== selectedVehicle) show = false;
      if (show && !mapInstance.hasLayer(markerData.marker)) {
        markerData.marker.addTo(mapInstance);
      }
      if (!show && mapInstance.hasLayer(markerData.marker)) {
        mapInstance.removeLayer(markerData.marker);
      }
    });
  }

  function updateTimetables() {
    const now = new Date();
    const timetableDefs = {
      dasma: { first: '05:15', last: '20:45', freq: 18 },
      trece: { first: '05:00', last: '21:00', freq: 15 },
      alfonso: { first: '05:30', last: '20:30', freq: 20 },
      olivarez: { first: '05:20', last: '20:30', freq: 18 }
    };

    timetableCards.forEach(function(card) {
      const route = card.getAttribute('data-route');
      const def = timetableDefs[route] || timetableDefs.trece;
      const [hour, minute] = def.first.split(':').map(function(value) { return parseInt(value, 10); });
      const firstTrip = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      let nextTrip = new Date(firstTrip.getTime());

      while (nextTrip.getTime() <= now.getTime()) {
        nextTrip = new Date(nextTrip.getTime() + def.freq * 60000);
        if ((nextTrip.getTime() - firstTrip.getTime()) > 24 * 3600 * 1000) break;
      }

      const nextTripText = nextTrip.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const infoEls = card.querySelectorAll('p');
      if (infoEls.length >= 3) {
        infoEls[0].innerHTML = `<strong>First Trip:</strong> ${def.first}`;
        infoEls[1].innerHTML = `<strong>Last Trip:</strong> ${def.last}`;
        infoEls[2].innerHTML = `<strong>Frequency:</strong> Every ${def.freq} minutes<br><strong>Next Trip:</strong> ${nextTripText}`;
      }
    });
  }

  function rotateStatuses() {
    markers.forEach(function(markerData) {
      const nextStatus = markerData.status === 'available'
        ? 'limited'
        : markerData.status === 'limited'
          ? 'unavailable'
          : 'available';

      markerData.status = nextStatus;
      updateCardContent(markerData);
      updatePopup(markerData);
    });
  }

  function startStatusLoop() {
    if (statusInterval) clearInterval(statusInterval);

    const params = new URLSearchParams(window.location.search);
    const demoMode = (typeof localStorage !== 'undefined' && localStorage.getItem('demoMode') === '1') || params.get('demo') === '1';
    const forcedMs = parseInt(params.get('intervalMs'), 10);
    let min = 50 * 60 * 1000;
    let max = 90 * 60 * 1000;

    if (!Number.isNaN(forcedMs) && forcedMs > 0) {
      min = Math.max(1000, Math.floor(forcedMs / 2));
      max = Math.max(min + 1000, forcedMs);
    } else if (demoMode) {
      min = 10000;
      max = 30000;
    }

    const interval = Math.floor(Math.random() * (max - min)) + min;

    statusInterval = setInterval(function() {
      rotateStatuses();
      updateTimetables();
      renderVehicleSummary();
      clearInterval(statusInterval);
      startStatusLoop();
    }, interval);

    updateTimetables();
  }

  function applyFilters() {
    const selectedRoute = routeSelect ? routeSelect.value : 'all';
    const selectedVehicle = vehicleSelect ? vehicleSelect.value : 'all';

    if (vehiclesList) {
      vehiclesList.querySelectorAll('.vehicle-card').forEach(function(card) {
        const route = card.getAttribute('data-route');
        const type = card.getAttribute('data-vehicles');
        const show = (selectedRoute === 'all' || route === selectedRoute) && (selectedVehicle === 'all' || type === selectedVehicle);
        card.style.display = show ? '' : 'none';
      });
    }

    timetableCards.forEach(function(card) {
      const route = card.getAttribute('data-route');
      card.style.display = selectedRoute === 'all' || selectedRoute === route ? '' : 'none';
    });

    if (mapInstance) updateMarkersVisibility(selectedRoute, selectedVehicle);
  }

  if (routeSelect) {
    routeSelect.addEventListener('change', function() {
      applyFilters();
      renderVehicleSummary();
    });
  }

  if (vehicleSelect) {
    vehicleSelect.addEventListener('change', function() {
      applyFilters();
      renderVehicleSummary();
    });
  }

  document.addEventListener('forceStatusUpdate', function() {
    rotateStatuses();
    updateTimetables();
    renderVehicleSummary();
  });

  function bootMap() {
    if (mapInstance) return;

    mapInstance = initMap();
    if (!mapInstance) return;

    const mapEl = document.getElementById('map');
    if (mapEl && mapEl.getBoundingClientRect().height === 0) {
      mapEl.style.height = '460px';
    }

    setTimeout(function() {
      hydrateMapMarkers(mapInstance);
      mapInstance.invalidateSize();
      if (!terminalMarker) {
        terminalMarker = L.marker([defaultCenter.lat, defaultCenter.lng]).addTo(mapInstance);
        terminalMarker.bindPopup('Terminal reference point').openPopup();
      }
      mapInstance.setView([defaultCenter.lat, defaultCenter.lng], defaultZoom);
    }, 150);
  }

  function refreshPortalVehicles() {
    if (mapInstance) {
      markers.forEach(function(markerData) {
        if (markerData.marker && mapInstance.hasLayer(markerData.marker)) {
          mapInstance.removeLayer(markerData.marker);
        }
      });
      if (terminalMarker && mapInstance.hasLayer(terminalMarker)) {
        mapInstance.removeLayer(terminalMarker);
        terminalMarker = null;
      }
    }

    createVehicleData();
    renderVehicleSummary();
    applyFilters();

    if (mapInstance) {
      hydrateMapMarkers(mapInstance);
      mapInstance.invalidateSize();
      if (!terminalMarker) {
        terminalMarker = L.marker([defaultCenter.lat, defaultCenter.lng]).addTo(mapInstance);
        terminalMarker.bindPopup('Terminal reference point');
      }
    }
  }

  createVehicleData();
  updateTimetables();
  applyFilters();

  if (!movementInterval) {
    movementInterval = setInterval(simulateMovement, 5000);
  }

  startStatusLoop();

  const mapEl = document.getElementById('map');
  if (mapEl && typeof window.spotActivateWhenVisible === 'function') {
    window.spotActivateWhenVisible(mapEl, bootMap, { rootMargin: '260px 0px' });
  } else {
    bootMap();
  }

  if (showLocationBtn) {
    showLocationBtn.addEventListener('click', function() {
      if (!mapInstance) {
        bootMap();
      }

      if (!mapInstance) {
        alert('Map is still loading. Please try again in a moment.');
        return;
      }

      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      showLocationBtn.disabled = true;
      showLocationBtn.textContent = 'Locating...';

      navigator.geolocation.getCurrentPosition(function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        mapInstance.setView([lat, lng], 14);
        if (userMarker) userMarker.remove();
        userMarker = L.marker([lat, lng]).addTo(mapInstance);
        userMarker.bindPopup('You are here').openPopup();
        showLocationBtn.disabled = false;
        showLocationBtn.textContent = 'Show My Location';
      }, function(error) {
        alert(`Unable to retrieve your location: ${error.message || 'error'}`);
        showLocationBtn.disabled = false;
        showLocationBtn.textContent = 'Show My Location';
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  window.addEventListener('storage', function(event) {
    if (event.key === 'spot-driver-profile') {
      refreshPortalVehicles();
    }
  });
});
