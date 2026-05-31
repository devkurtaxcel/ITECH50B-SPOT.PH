document.addEventListener('DOMContentLoaded', function() {
  const section = document.getElementById('fuel-intelligence-section');
  if (!section) return;

  const areaSelect = document.getElementById('fuel-area-select');
  const fuelTypeSelect = document.getElementById('fuel-type-select');
  const refreshButton = document.getElementById('fuel-refresh-btn');
  const nearbyButton = document.getElementById('fuel-nearby-btn');
  const sourceNote = document.getElementById('fuel-source-note');
  const statusMessage = document.getElementById('fuel-status-message');
  const localHeading = document.getElementById('fuel-local-heading');
  const liveGrid = document.getElementById('fuel-live-grid');
  const trendGrid = document.getElementById('fuel-trend-grid');
  const stationList = document.getElementById('fuel-station-list');
  const chartSvg = document.getElementById('fuel-chart-svg');
  const chartLegend = document.getElementById('fuel-chart-legend');
  const chartCaption = document.getElementById('fuel-chart-caption');
  const fuelSourceUrl = 'https://gaswatchph.com/js/data.js';
  const supportedFuels = {
    diesel: {
      label: 'Diesel',
      stationKey: 'diesel',
      historyKey: 'diesel'
    },
    unleaded: {
      label: 'Gasoline 91',
      stationKey: 'unleaded',
      historyKey: 'unleaded'
    }
  };
  const preferredAreas = ['Indang', 'Alfonso', 'Dasmari\u00f1as', 'Trece Martires', 'Tagaytay', 'Mendez', 'Silang', 'Cavite City'];
  let gasData = null;
  let currentLocation = null;
  let sortMode = 'area';

  function fixText(value) {
    return String(value || '')
      .replace(/ÃƒÂ±/g, '\u00f1')
      .replace(/Ãƒâ€˜/g, '\u00d1')
      .replace(/ÃƒÂ¡/g, '\u00e1')
      .replace(/ÃƒÂ©/g, '\u00e9')
      .replace(/ÃƒÂ­/g, '\u00ed')
      .replace(/ÃƒÂ³/g, '\u00f3')
      .replace(/ÃƒÂº/g, '\u00fa')
      .replace(/Ã¢â‚¬â€œ/g, '-')
      .replace(/Ã¢â‚¬â€/g, '-')
      .replace(/Ã¢â€šÂ±/g, '\u20b1');
  }

  function formatCurrency(value) {
    return `\u20b1${Number(value || 0).toFixed(2)}`;
  }

  function formatPercent(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  function setStatus(text, tone) {
    if (!statusMessage) return;
    statusMessage.textContent = text;
    statusMessage.dataset.tone = tone || 'neutral';
  }

  function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRadians = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRadians;
    const dLng = (lng2 - lng1) * toRadians;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRadians) * Math.cos(lat2 * toRadians) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
  }

  async function loadGasWatchData() {
    const response = await fetch(fuelSourceUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Fuel source returned ${response.status}`);
    }

    const text = await response.text();
    const parsed = new Function(`${text}; return { LAST_UPDATED, PRICE_HISTORY, GAS_STATIONS, BRANDS };`)();

    return {
      lastUpdated: fixText(parsed.LAST_UPDATED),
      priceHistory: Array.isArray(parsed.PRICE_HISTORY) ? parsed.PRICE_HISTORY : [],
      stations: Array.isArray(parsed.GAS_STATIONS) ? parsed.GAS_STATIONS : [],
      brands: parsed.BRANDS || {}
    };
  }

  function populateAreas() {
    if (!gasData || !areaSelect) return;

    const allAreas = new Set();
    gasData.stations.forEach(function(station) {
      const area = fixText(station.area);
      if (area) allAreas.add(area);
    });

    const orderedAreas = preferredAreas.filter(function(area) {
      return allAreas.has(area);
    });

    Array.from(allAreas)
      .sort(function(a, b) {
        return a.localeCompare(b);
      })
      .forEach(function(area) {
        if (!orderedAreas.includes(area)) orderedAreas.push(area);
      });

    const options = ['All nearby areas'].concat(orderedAreas);
    areaSelect.innerHTML = options.map(function(area, index) {
      const value = index === 0 ? 'all' : area;
      return `<option value="${value}">${area}</option>`;
    }).join('');

    const defaultArea = orderedAreas.includes('Indang') ? 'Indang' : (orderedAreas[0] || 'all');
    areaSelect.value = defaultArea;
  }

  function getFilteredStations() {
    if (!gasData) return [];

    const fuelConfig = supportedFuels[fuelTypeSelect ? fuelTypeSelect.value : 'diesel'] || supportedFuels.diesel;
    const selectedArea = areaSelect ? areaSelect.value : 'all';

    return gasData.stations
      .map(function(station) {
        return {
          ...station,
          areaLabel: fixText(station.area),
          brandLabel: fixText(gasData.brands[station.brand] ? gasData.brands[station.brand].name : station.brand),
          stationName: fixText(station.name),
          price: station.prices ? station.prices[fuelConfig.stationKey] : null
        };
      })
      .filter(function(station) {
        if (typeof station.price !== 'number' || Number.isNaN(station.price)) return false;
        if (selectedArea !== 'all' && station.areaLabel !== selectedArea) return false;
        return true;
      })
      .map(function(station) {
        const distanceKm = currentLocation
          ? haversineDistance(currentLocation.lat, currentLocation.lng, station.lat, station.lng)
          : null;

        return {
          ...station,
          distanceKm
        };
      })
      .sort(function(a, b) {
        if (sortMode === 'nearby' && currentLocation) {
          return (a.distanceKm || Number.POSITIVE_INFINITY) - (b.distanceKm || Number.POSITIVE_INFINITY);
        }
        return a.price - b.price;
      });
  }

  function getHistorySeries() {
    if (!gasData) return [];

    const fuelConfig = supportedFuels[fuelTypeSelect ? fuelTypeSelect.value : 'diesel'] || supportedFuels.diesel;

    return gasData.priceHistory.slice(0, 5).map(function(entry) {
      const brandValues = Object.keys(entry.brands || {})
        .map(function(brandKey) {
          const brandEntry = entry.brands[brandKey];
          return brandEntry ? brandEntry[fuelConfig.historyKey] : null;
        })
        .filter(function(value) {
          return typeof value === 'number' && !Number.isNaN(value);
        });

      return {
        week: entry.week,
        label: fixText(entry.label),
        avg: fuelConfig.historyKey === 'diesel' ? entry.dieselAvg : entry.unleadedAvg,
        low: brandValues.length ? Math.min.apply(Math, brandValues) : 0,
        high: brandValues.length ? Math.max.apply(Math, brandValues) : 0
      };
    });
  }

  function percentChange(currentValue, previousValue) {
    if (!previousValue) return 0;
    return ((currentValue - previousValue) / previousValue) * 100;
  }

  function trendTone(value) {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  function renderLiveCards(stations) {
    if (!liveGrid) return;

    const values = stations.map(function(station) {
      return station.price;
    });
    const average = values.length ? values.reduce(function(sum, value) {
      return sum + value;
    }, 0) / values.length : 0;
    const cheapest = stations[0] || null;
    const highest = stations.length ? stations[stations.length - 1] : null;
    const spread = cheapest && highest ? highest.price - cheapest.price : 0;

    liveGrid.innerHTML = `
      <article class="fuel-metric-card">
        <span class="fuel-metric-card__eyebrow">Live Average</span>
        <strong class="fuel-metric-card__value">${formatCurrency(average)}</strong>
        <p class="fuel-metric-card__meta">${stations.length} stations tracked</p>
      </article>
      <article class="fuel-metric-card">
        <span class="fuel-metric-card__eyebrow">Cheapest Local Station</span>
        <strong class="fuel-metric-card__value">${cheapest ? formatCurrency(cheapest.price) : 'N/A'}</strong>
        <p class="fuel-metric-card__meta">${cheapest ? `${cheapest.stationName} - ${cheapest.areaLabel}` : 'No stations found'}</p>
      </article>
      <article class="fuel-metric-card">
        <span class="fuel-metric-card__eyebrow">Highest Local Station</span>
        <strong class="fuel-metric-card__value">${highest ? formatCurrency(highest.price) : 'N/A'}</strong>
        <p class="fuel-metric-card__meta">${highest ? `${highest.stationName} - ${highest.areaLabel}` : 'No stations found'}</p>
      </article>
      <article class="fuel-metric-card">
        <span class="fuel-metric-card__eyebrow">Current Spread</span>
        <strong class="fuel-metric-card__value">${formatCurrency(spread)}</strong>
        <p class="fuel-metric-card__meta">Gap from lowest to highest</p>
      </article>
    `;
  }

  function renderTrendCards(series) {
    if (!trendGrid || !series.length) return;

    const latest = series[0];
    const previous7 = series[1] || latest;
    const previous30 = series[4] || series[series.length - 1] || latest;
    const low7Change = percentChange(latest.low, previous7.low);
    const high7Change = percentChange(latest.high, previous7.high);
    const low30Change = percentChange(latest.low, previous30.low);
    const high30Change = percentChange(latest.high, previous30.high);

    const cards = [
      {
        label: '7-Day Low',
        value: formatPercent(low7Change),
        tone: trendTone(low7Change),
        note: `${formatCurrency(latest.low)} vs ${formatCurrency(previous7.low)}`
      },
      {
        label: '7-Day High',
        value: formatPercent(high7Change),
        tone: trendTone(high7Change),
        note: `${formatCurrency(latest.high)} vs ${formatCurrency(previous7.high)}`
      },
      {
        label: '30-Day Low',
        value: formatPercent(low30Change),
        tone: trendTone(low30Change),
        note: `${formatCurrency(latest.low)} vs ${formatCurrency(previous30.low)}`
      },
      {
        label: '30-Day High',
        value: formatPercent(high30Change),
        tone: trendTone(high30Change),
        note: `${formatCurrency(latest.high)} vs ${formatCurrency(previous30.high)}`
      }
    ];

    trendGrid.innerHTML = cards.map(function(card) {
      return `
        <article class="fuel-trend-card">
          <span class="fuel-trend-card__label">${card.label}</span>
          <strong class="fuel-trend-card__value fuel-trend-card__value--${card.tone}">${card.value}</strong>
          <p class="fuel-trend-card__note">${card.note}</p>
        </article>
      `;
    }).join('');
  }

  function renderChart(series) {
    if (!chartSvg || !chartLegend || !chartCaption || !series.length) return;

    const ordered = series.slice().reverse();
    const width = 640;
    const height = 280;
    const padding = { top: 28, right: 30, bottom: 46, left: 48 };
    const maxValue = Math.max.apply(Math, ordered.map(function(entry) { return entry.high; }));
    const minValue = Math.min.apply(Math, ordered.map(function(entry) { return entry.low; }));
    const valueRange = Math.max(1, maxValue - minValue);
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    function x(index) {
      return padding.left + (ordered.length === 1 ? plotWidth / 2 : (plotWidth / (ordered.length - 1)) * index);
    }

    function y(value) {
      return padding.top + ((maxValue - value) / valueRange) * plotHeight;
    }

    function polylinePoints(key) {
      return ordered.map(function(entry, index) {
        return `${x(index)},${y(entry[key])}`;
      }).join(' ');
    }

    const highPoints = ordered.map(function(entry, index) {
      return `${x(index)},${y(entry.high)}`;
    });
    const lowPoints = ordered.map(function(entry, index) {
      return `${x(index)},${y(entry.low)}`;
    }).reverse();
    const bandPoints = highPoints.concat(lowPoints).join(' ');
    const yTicks = 4;
    const gridLines = [];

    for (let tick = 0; tick <= yTicks; tick += 1) {
      const value = maxValue - (valueRange / yTicks) * tick;
      const yPosition = y(value);
      gridLines.push(`
        <line x1="${padding.left}" y1="${yPosition}" x2="${width - padding.right}" y2="${yPosition}" class="fuel-chart__grid-line"></line>
        <text x="${padding.left - 10}" y="${yPosition + 4}" text-anchor="end" class="fuel-chart__axis">${formatCurrency(value)}</text>
      `);
    }

    const labels = ordered.map(function(entry, index) {
      return `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="fuel-chart__axis">${entry.label}</text>`;
    }).join('');

    chartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    chartSvg.innerHTML = `
      <defs>
        <linearGradient id="fuel-band-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(20, 93, 160, 0.20)"></stop>
          <stop offset="100%" stop-color="rgba(20, 93, 160, 0.02)"></stop>
        </linearGradient>
      </defs>
      ${gridLines.join('')}
      <polygon points="${bandPoints}" class="fuel-chart__band"></polygon>
      <polyline points="${polylinePoints('high')}" class="fuel-chart__line fuel-chart__line--high"></polyline>
      <polyline points="${polylinePoints('avg')}" class="fuel-chart__line fuel-chart__line--avg"></polyline>
      <polyline points="${polylinePoints('low')}" class="fuel-chart__line fuel-chart__line--low"></polyline>
      ${ordered.map(function(entry, index) {
        return `
          <circle cx="${x(index)}" cy="${y(entry.avg)}" r="4.5" class="fuel-chart__dot fuel-chart__dot--avg"></circle>
          <circle cx="${x(index)}" cy="${y(entry.high)}" r="3.5" class="fuel-chart__dot fuel-chart__dot--high"></circle>
          <circle cx="${x(index)}" cy="${y(entry.low)}" r="3.5" class="fuel-chart__dot fuel-chart__dot--low"></circle>
        `;
      }).join('')}
      ${labels}
    `;

    chartLegend.innerHTML = `
      <span><i class="fuel-chart-legend__swatch fuel-chart-legend__swatch--low"></i>Low</span>
      <span><i class="fuel-chart-legend__swatch fuel-chart-legend__swatch--avg"></i>Average</span>
      <span><i class="fuel-chart-legend__swatch fuel-chart-legend__swatch--high"></i>High</span>
    `;

    chartCaption.textContent = `Weekly view based on GasWatch PH snapshots for ${supportedFuels[fuelTypeSelect.value].label}.`;
  }

  function renderStationCards(stations) {
    if (!stationList) return;

    const limitedStations = stations.slice(0, 8);

    stationList.innerHTML = limitedStations.map(function(station) {
      const brand = gasData.brands[station.brand] || {};
      const distanceMeta = currentLocation && station.distanceKm != null
        ? `<span>${station.distanceKm.toFixed(1)} km away</span>`
        : '';
      const color = brand.color || '#145da0';

      return `
        <article class="fuel-station-card">
          <div class="fuel-station-card__head">
            <span class="fuel-station-card__brand" style="--brand-accent:${color};">${station.brandLabel}</span>
            <strong class="fuel-station-card__price">${formatCurrency(station.price)}</strong>
          </div>
          <h4 class="fuel-station-card__title">${station.stationName}</h4>
          <p class="fuel-station-card__meta">${station.areaLabel}</p>
          <div class="fuel-station-card__footer">
            <span>${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}</span>
            ${distanceMeta}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderFuelView() {
    if (!gasData) return;

    const stations = getFilteredStations();
    const series = getHistorySeries();
    const selectedArea = areaSelect ? areaSelect.value : 'all';
    const areaLabel = selectedArea === 'all' ? 'all nearby areas' : selectedArea;

    if (sourceNote) {
      sourceNote.textContent = `Source: GasWatch PH. Updated ${gasData.lastUpdated}.`;
    }

    if (localHeading) {
      localHeading.textContent = sortMode === 'nearby' && currentLocation
        ? 'Nearest stations'
        : `Stations in ${areaLabel}`;
    }

    if (!stations.length) {
      renderLiveCards([]);
      renderTrendCards(series);
      renderChart(series);
      stationList.innerHTML = '<div class="fleet-summary-empty">No stations found for this filter.</div>';
      setStatus('No station prices found for this filter.', 'warning');
      return;
    }

    renderLiveCards(stations);
    renderTrendCards(series);
    renderChart(series);
    renderStationCards(stations);
    setStatus(`Showing ${stations.length} ${supportedFuels[fuelTypeSelect.value].label} prices.`, 'success');

    if (typeof window.spotRefreshScrollReveals === 'function') {
      window.spotRefreshScrollReveals(section);
    }
  }

  async function refreshFuelData() {
    setStatus('Loading live Philippine fuel data...', 'loading');
    if (refreshButton) refreshButton.disabled = true;

    try {
      gasData = await loadGasWatchData();
      populateAreas();
      renderFuelView();
    } catch (error) {
      setStatus('Live fuel data is unavailable right now.', 'error');
      if (stationList) {
        stationList.innerHTML = '<div class="fleet-summary-empty">Fuel data could not be loaded.</div>';
      }
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  if (areaSelect) {
    areaSelect.addEventListener('change', function() {
      sortMode = 'area';
      renderFuelView();
    });
  }

  if (fuelTypeSelect) {
    fuelTypeSelect.addEventListener('change', function() {
      renderFuelView();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', refreshFuelData);
  }

  if (nearbyButton) {
    nearbyButton.addEventListener('click', function() {
      if (!navigator.geolocation) {
        setStatus('Geolocation is not supported in this browser.', 'error');
        return;
      }

      nearbyButton.disabled = true;
      nearbyButton.textContent = 'Locating...';

      navigator.geolocation.getCurrentPosition(function(position) {
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        sortMode = 'nearby';
        renderFuelView();
        nearbyButton.disabled = false;
        nearbyButton.textContent = 'Use My Location';
      }, function(error) {
        setStatus(`Unable to read your location: ${error.message || 'Please try again.'}`, 'error');
        nearbyButton.disabled = false;
        nearbyButton.textContent = 'Use My Location';
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  refreshFuelData();
});
