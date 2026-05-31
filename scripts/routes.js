document.addEventListener('DOMContentLoaded', function() {
  const routeButtons = Array.from(document.querySelectorAll('.route-btn[data-target]'));
  const routeIframes = Array.from(document.querySelectorAll('.route-iframe'));
  const routesToggleBtn = document.getElementById('routes-toggle-btn');
  const routeMapsContainer = document.querySelector('.route-maps');
  const noRouteMessage = document.getElementById('no-route-message');
  const routeLabels = {
    'route-indang-alfonso': 'Indang to Alfonso',
    'route-indang-trece': 'Indang to Trece',
    'route-indang-dasma': 'Indang to Dasma',
    'route-indang-olivarez': 'Indang to Olivarez',
    'route-all': 'Show All'
  };

  function setActiveButton(targetId) {
    routeButtons.forEach(function(button) {
      const isActive = button.getAttribute('data-target') === targetId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function showMaps() {
    if (!routeMapsContainer || !routesToggleBtn || !noRouteMessage) return;
    routeMapsContainer.style.display = '';
    noRouteMessage.style.display = 'none';
    routesToggleBtn.textContent = 'Hide Maps';
    routesToggleBtn.setAttribute('aria-expanded', 'true');
    routesToggleBtn.setAttribute('aria-pressed', 'true');
    routesToggleBtn.classList.add('is-active');
  }

  function hideMaps() {
    if (!routeMapsContainer || !routesToggleBtn || !noRouteMessage) return;
    routeMapsContainer.style.display = 'none';
    noRouteMessage.style.display = 'block';
    routesToggleBtn.textContent = 'Show Maps';
    routesToggleBtn.setAttribute('aria-expanded', 'false');
    routesToggleBtn.setAttribute('aria-pressed', 'false');
    routesToggleBtn.classList.remove('is-active');
  }

  function showRoute(targetId) {
    if (!routeIframes.length) return;
    showMaps();
    routeIframes.forEach(function(frame) {
      frame.style.display = targetId === 'route-all' || frame.id === targetId ? 'block' : 'none';
    });
    setActiveButton(targetId);
    const selectedFrame = targetId === 'route-all' ? routeMapsContainer : document.getElementById(targetId);
    if (selectedFrame) {
      selectedFrame.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  routeButtons.forEach(function(button) {
    const target = button.getAttribute('data-target');
    if (routeLabels[target]) {
      button.textContent = routeLabels[target];
    }
    button.addEventListener('click', function() {
      showRoute(target);
    });
    button.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });
  });

  if (routesToggleBtn && routeMapsContainer && noRouteMessage) {
    routesToggleBtn.addEventListener('click', function() {
      if (routeMapsContainer.style.display === 'none') {
        showMaps();
      } else {
        hideMaps();
      }
    });

    routesToggleBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        routesToggleBtn.click();
      }
    });
  }

  if (routeButtons.length) {
    setActiveButton('route-all');
  }

  if (routeMapsContainer && routeMapsContainer.style.display === 'none') {
    hideMaps();
  } else {
    showMaps();
  }
});
