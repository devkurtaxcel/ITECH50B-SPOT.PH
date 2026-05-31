document.addEventListener('DOMContentLoaded', function() {
  const sharedStore = window.spotDataStore || null;
  const driverFilter = document.getElementById('driver-vehicle-filter');
  const tableBody = document.querySelector('.drivers-table tbody');
  const headers = Array.from(document.querySelectorAll('.drivers-table thead th')).map(function(header) {
    return header.textContent.trim();
  });
  const modal = document.getElementById('driver-modal');

  if (!tableBody) return;

  function titleCase(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function createPortalRow(record) {
    const row = document.createElement('tr');
    row.className = 'is-portal-driver';
    row.setAttribute('data-vehicle', record.vehicleType);
    row.innerHTML = `
      <td><div class="driver-photo">${record.initials}</div></td>
      <td>${record.name}</td>
      <td>${titleCase(record.vehicleType)}</td>
      <td>${record.plateNumber}</td>
      <td>${record.routeLabel}</td>
      <td class="contact"><span class="contact-icon" aria-hidden="true">&#9742;</span><a href="${record.contactHref}">${record.contactText}</a></td>
      <td>${record.schedule}</td>
      <td>${record.lastTripTime}</td>
    `;
    return row;
  }

  function buildDriverData(row) {
    const cells = Array.from(row.querySelectorAll('td'));
    const contactLink = row.querySelector('.contact a[href^="tel:"]');
    const initials = row.querySelector('.driver-photo');

    return {
      initials: initials ? initials.textContent.trim() : 'DR',
      name: cells[1] ? cells[1].textContent.trim() : 'Driver',
      vehicleType: cells[2] ? cells[2].textContent.trim() : 'N/A',
      plateNumber: cells[3] ? cells[3].textContent.trim() : 'N/A',
      route: cells[4] ? cells[4].textContent.trim() : 'N/A',
      contactText: contactLink ? contactLink.textContent.trim() : 'Not available',
      contactHref: contactLink ? contactLink.getAttribute('href') : '',
      schedule: cells[6] ? cells[6].textContent.trim() : 'N/A',
      lastTrip: cells[7] ? cells[7].textContent.trim() : 'N/A'
    };
  }

  function hydrateRow(row) {
    if (!(row instanceof HTMLElement)) return;

    row.querySelectorAll('td').forEach(function(cell, index) {
      cell.setAttribute('data-label', headers[index] || 'Detail');
    });

    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-haspopup', 'dialog');
    row.setAttribute('aria-label', 'View driver details');

    row.querySelectorAll('a').forEach(function(link) {
      if (link.dataset.modalSafe === 'true') return;
      link.dataset.modalSafe = 'true';
      link.addEventListener('click', function(event) {
        event.stopPropagation();
      });
    });
  }

  function injectPortalRows() {
    tableBody.querySelectorAll('.is-portal-driver').forEach(function(row) {
      row.remove();
    });

    if (!sharedStore || typeof sharedStore.getPublishedDriverRecords !== 'function') return;

    const records = sharedStore.getPublishedDriverRecords();
    records.reverse().forEach(function(record) {
      tableBody.prepend(createPortalRow(record));
    });
  }

  function collectRows() {
    return Array.from(tableBody.querySelectorAll('tr'));
  }

  function applyFilter() {
    if (!driverFilter) return;

    const value = driverFilter.value.toLowerCase();
    collectRows().forEach(function(row) {
      const vehicle = (row.getAttribute('data-vehicle') || '').toLowerCase();
      row.hidden = !(value === 'all' || vehicle === value);
    });
  }

  if (driverFilter) {
    driverFilter.addEventListener('change', applyFilter);
  }

  if (!modal) {
    injectPortalRows();
    collectRows().forEach(hydrateRow);
    applyFilter();
    return;
  }

  const closeButton = modal.querySelector('[data-driver-modal-close]');
  const modalAvatar = modal.querySelector('[data-driver-modal-avatar]');
  const modalTitle = modal.querySelector('[data-driver-modal-title]');
  const modalSubtitle = modal.querySelector('[data-driver-modal-subtitle]');
  const modalSummary = modal.querySelector('[data-driver-modal-summary]');
  const modalVehicle = modal.querySelector('[data-driver-modal-vehicle]');
  const modalPlate = modal.querySelector('[data-driver-modal-plate]');
  const modalRoute = modal.querySelector('[data-driver-modal-route]');
  const modalContact = modal.querySelector('[data-driver-modal-contact]');
  const modalSchedule = modal.querySelector('[data-driver-modal-schedule]');
  const modalLastTrip = modal.querySelector('[data-driver-modal-last-trip]');
  const modalCallButton = modal.querySelector('[data-driver-modal-call]');
  let lastFocusedRow = null;

  function openModal(row) {
    const data = buildDriverData(row);
    lastFocusedRow = row;

    if (modalAvatar) modalAvatar.textContent = data.initials;
    if (modalTitle) modalTitle.textContent = data.name;
    if (modalSubtitle) modalSubtitle.textContent = `${data.vehicleType} assigned to ${data.route}`;
    if (modalSummary) {
      modalSummary.textContent = `${data.name} is assigned to ${data.route}. Check the details below.`;
    }
    if (modalVehicle) modalVehicle.textContent = data.vehicleType;
    if (modalPlate) modalPlate.textContent = data.plateNumber;
    if (modalRoute) modalRoute.textContent = data.route;
    if (modalSchedule) modalSchedule.textContent = data.schedule;
    if (modalLastTrip) modalLastTrip.textContent = data.lastTrip;
    if (modalContact) {
      modalContact.innerHTML = data.contactHref
        ? `<a href="${data.contactHref}">${data.contactText}</a>`
        : data.contactText;
    }
    if (modalCallButton) {
      if (data.contactHref) {
        modalCallButton.setAttribute('href', data.contactHref);
        modalCallButton.removeAttribute('aria-disabled');
      } else {
        modalCallButton.setAttribute('href', '#');
        modalCallButton.setAttribute('aria-disabled', 'true');
      }
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(function() {
      modal.classList.add('is-open');
      if (closeButton) closeButton.focus();
    });
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    window.setTimeout(function() {
      modal.hidden = true;
      if (lastFocusedRow) lastFocusedRow.focus();
    }, 240);
  }

  function bindRowInteractions(row) {
    if (!(row instanceof HTMLElement) || row.dataset.directoryBound === 'true') return;

    row.dataset.directoryBound = 'true';
    row.addEventListener('click', function(event) {
      if (event.target.closest('a, button')) return;
      openModal(row);
    });

    row.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(row);
      }
    });
  }

  function refreshRows() {
    injectPortalRows();
    collectRows().forEach(function(row) {
      hydrateRow(row);
      bindRowInteractions(row);
    });
    applyFilter();

    if (typeof window.spotRefreshScrollReveals === 'function') {
      window.spotRefreshScrollReveals(tableBody);
    }
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }

  modal.addEventListener('click', function(event) {
    if (event.target === modal || event.target.hasAttribute('data-driver-modal-close')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });

  window.addEventListener('storage', function(event) {
    if (event.key === 'spot-driver-profile') {
      refreshRows();
    }
  });

  refreshRows();
});
