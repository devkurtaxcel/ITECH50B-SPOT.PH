document.addEventListener('DOMContentLoaded', function() {
  const section = document.querySelector('.driver-portal-section');
  if (!section) return;

  const sharedStore = window.spotDataStore;
  if (!sharedStore) return;

  const form = document.getElementById('driver-portal-form');
  const feedback = document.getElementById('driver-portal-feedback');
  const resetButton = document.getElementById('driver-reset-btn');
  const startGpsButton = document.getElementById('driver-gps-start-btn');
  const stopGpsButton = document.getElementById('driver-gps-stop-btn');
  const gpsOnceButton = document.getElementById('driver-gps-once-btn');
  let watchId = null;
  let currentProfile = sharedStore.loadDriverProfile();

  function safeText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function feedbackMessage(text, tone) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.dataset.tone = tone || 'neutral';
  }

  function titleCase(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function formatTimestamp(value) {
    if (!value) return 'Not yet synced';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not yet synced';
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function initialsForName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return 'DR';
    return parts.map(function(part) {
      return part.charAt(0).toUpperCase();
    }).join('');
  }

  function populateForm(profile) {
    const fieldMap = {
      'driver-name': profile.name,
      'driver-phone': profile.phone,
      'driver-emergency-contact': profile.emergencyContact,
      'driver-route': profile.route,
      'driver-vehicle-type': profile.vehicleType,
      'driver-plate-number': profile.plateNumber,
      'driver-vehicle-model': profile.vehicleModel,
      'driver-vehicle-color': profile.vehicleColor,
      'driver-seat-capacity': profile.seatCapacity,
      'driver-seats-available': profile.seatsAvailable,
      'driver-operator-name': profile.operatorName,
      'driver-terminal': profile.terminal,
      'driver-status': profile.status,
      'driver-schedule': profile.schedule,
      'driver-last-trip-time': profile.lastTripTime,
      'driver-public-note': profile.publicNote,
      'driver-bio': profile.bio
    };

    Object.keys(fieldMap).forEach(function(id) {
      const field = document.getElementById(id);
      if (field) field.value = fieldMap[id];
    });

    const publicToggle = document.getElementById('driver-public-visible');
    if (publicToggle) publicToggle.checked = profile.publicVisible;
  }

  function collectProfile() {
    return {
      name: document.getElementById('driver-name').value,
      phone: document.getElementById('driver-phone').value,
      emergencyContact: document.getElementById('driver-emergency-contact').value,
      route: document.getElementById('driver-route').value,
      vehicleType: document.getElementById('driver-vehicle-type').value,
      plateNumber: document.getElementById('driver-plate-number').value,
      vehicleModel: document.getElementById('driver-vehicle-model').value,
      vehicleColor: document.getElementById('driver-vehicle-color').value,
      seatCapacity: document.getElementById('driver-seat-capacity').value,
      seatsAvailable: document.getElementById('driver-seats-available').value,
      operatorName: document.getElementById('driver-operator-name').value,
      terminal: document.getElementById('driver-terminal').value,
      status: document.getElementById('driver-status').value,
      schedule: document.getElementById('driver-schedule').value,
      lastTripTime: document.getElementById('driver-last-trip-time').value,
      publicVisible: document.getElementById('driver-public-visible').checked,
      publicNote: document.getElementById('driver-public-note').value,
      bio: document.getElementById('driver-bio').value,
      gpsSharing: currentProfile.gpsSharing,
      location: currentProfile.location
    };
  }

  function updateSummary(profile) {
    safeText('driver-status-pill', titleCase(profile.status));
    const statusPill = document.getElementById('driver-status-pill');
    if (statusPill) statusPill.dataset.status = profile.status;
    safeText('driver-summary-name', profile.name || 'No profile saved yet');
    safeText('driver-summary-route', `${titleCase(profile.route)} Route - ${profile.terminal}`);
    safeText('driver-summary-vehicle', profile.plateNumber ? `${titleCase(profile.vehicleType)} - ${profile.plateNumber}` : 'Not yet registered');
    safeText('driver-summary-seats', `${profile.seatsAvailable}/${profile.seatCapacity}`);
    safeText('driver-summary-visibility', profile.publicVisible ? 'On' : 'Off');
    safeText('driver-summary-updated', formatTimestamp(profile.updatedAt));
    safeText('driver-location-coordinates', `${profile.location.lat.toFixed(4)}, ${profile.location.lng.toFixed(4)}`);
    safeText('driver-location-updated', formatTimestamp(profile.location.updatedAt));
    safeText('driver-location-status', profile.gpsSharing ? 'Live sharing active' : 'Paused');

    const previewAvatar = document.getElementById('driver-preview-avatar');
    if (previewAvatar) previewAvatar.textContent = initialsForName(profile.name);
    safeText('driver-preview-name', profile.name || 'Driver profile preview');
    safeText('driver-preview-note', profile.publicNote || 'Add a short public note.');

    const previewList = document.getElementById('driver-preview-list');
    if (previewList) {
      previewList.innerHTML = `
        <div><span>Vehicle</span><strong>${titleCase(profile.vehicleType)}${profile.plateNumber ? ` - ${profile.plateNumber}` : ''}</strong></div>
        <div><span>Route</span><strong>${titleCase(profile.route)} Route</strong></div>
        <div><span>Operator</span><strong>${profile.operatorName || 'Not provided'}</strong></div>
        <div><span>Schedule</span><strong>${profile.schedule || 'Not provided'}</strong></div>
        <div><span>Seats Available</span><strong>${profile.seatsAvailable}/${profile.seatCapacity}</strong></div>
        <div><span>Directory Status</span><strong>${profile.publicVisible ? 'Visible to commuters' : 'Hidden from public views'}</strong></div>
      `;
    }

    if (startGpsButton) startGpsButton.disabled = profile.gpsSharing;
    if (stopGpsButton) stopGpsButton.disabled = !profile.gpsSharing;
  }

  function saveProfile(patch, message) {
    currentProfile = sharedStore.saveDriverProfile({
      ...collectProfile(),
      ...(patch || {})
    });
    updateSummary(currentProfile);
    feedbackMessage(message || 'Profile saved.', 'success');

    if (typeof window.spotRefreshScrollReveals === 'function') {
      window.spotRefreshScrollReveals(section);
    }
  }

  function stopGpsSharing(message) {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    saveProfile({ gpsSharing: false }, message || 'Live GPS sharing stopped.');
  }

  function handleLocation(position, keepWatching) {
    saveProfile({
      gpsSharing: keepWatching,
      location: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        updatedAt: new Date().toISOString()
      }
    }, keepWatching ? 'GPS updated.' : 'Location saved.');
  }

  function startGpsSharing() {
    if (!navigator.geolocation) {
      feedbackMessage('Geolocation is not available in this browser.', 'error');
      return;
    }

    if (watchId != null) {
      feedbackMessage('Live GPS sharing is already active.', 'neutral');
      return;
    }

    feedbackMessage('Starting GPS...', 'loading');
    watchId = navigator.geolocation.watchPosition(function(position) {
      handleLocation(position, true);
    }, function(error) {
      stopGpsSharing(`Live GPS could not continue: ${error.message || 'Unknown location error.'}`);
    }, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    });
  }

  if (form) {
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      saveProfile(null, 'Profile saved.');
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', function() {
      stopGpsSharing('Driver profile reset to local defaults.');
      currentProfile = sharedStore.saveDriverProfile(sharedStore.defaultProfile());
      populateForm(currentProfile);
      updateSummary(currentProfile);
    });
  }

  if (startGpsButton) {
    startGpsButton.addEventListener('click', startGpsSharing);
  }

  if (stopGpsButton) {
    stopGpsButton.addEventListener('click', function() {
      stopGpsSharing('Live GPS sharing stopped.');
    });
  }

  if (gpsOnceButton) {
    gpsOnceButton.addEventListener('click', function() {
      if (!navigator.geolocation) {
        feedbackMessage('Geolocation is not available in this browser.', 'error');
        return;
      }

      feedbackMessage('Getting your location...', 'loading');
      navigator.geolocation.getCurrentPosition(function(position) {
        handleLocation(position, currentProfile.gpsSharing);
      }, function(error) {
        feedbackMessage(`Location capture failed: ${error.message || 'Unknown location error.'}`, 'error');
      }, {
        enableHighAccuracy: true,
        timeout: 10000
      });
    });
  }

  window.addEventListener('storage', function(event) {
    if (event.key === 'spot-driver-profile') {
      currentProfile = sharedStore.loadDriverProfile();
      populateForm(currentProfile);
      updateSummary(currentProfile);
      feedbackMessage('Profile updated from another tab.', 'neutral');
    }
  });

  populateForm(currentProfile);
  updateSummary(currentProfile);

  if (currentProfile.gpsSharing) {
    startGpsSharing();
  }
});
