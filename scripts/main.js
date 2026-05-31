(function() {
  const root = document.documentElement;
  const storageKey = 'spot-theme';

  function activateWhenVisible(target, callback, options) {
    if (!target || typeof callback !== 'function') return;

    if (!('IntersectionObserver' in window)) {
      callback(target);
      return;
    }

    const observer = new IntersectionObserver(function(entries) {
      const entry = entries[0];
      if (!entry || (!entry.isIntersecting && entry.intersectionRatio <= 0)) return;
      observer.disconnect();
      callback(target);
    }, Object.assign({
      root: null,
      rootMargin: '220px 0px',
      threshold: 0.01
    }, options || {}));

    observer.observe(target);
  }

  window.spotActivateWhenVisible = activateWhenVisible;

  function readStoredTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function preferredTheme() {
    const stored = readStoredTheme();
    if (stored === 'light' || stored === 'dark') return stored;
    return 'light';
  }

  root.dataset.theme = preferredTheme();
})();

document.addEventListener('DOMContentLoaded', function() {
  const root = document.documentElement;
  const storageKey = 'spot-theme';
  const header = document.querySelector('.header');
  const hamburger = header ? header.querySelector('.hamburger') : null;
  const nav = header ? header.querySelector('.nav') : null;
  const scrollTopBtn = document.querySelector('.scroll-top-btn');
  let pageLoadingCleared = false;

  function initLazyAnimations() {
    const selector = 'dotlottie-wc[data-lottie-src]';
    const pendingAnimations = new Set();
    let fallbackBound = false;
    let frameQueued = false;

    function markReady(target) {
      if (!(target instanceof HTMLElement)) return;

      const src = target.getAttribute('data-lottie-src');
      if (!src) return;

      if (target.dataset.lazyReady !== 'true') {
        target.dataset.lazyReady = 'true';
        target.classList.add('is-lazy-ready');
      }

      if (target.getAttribute('src') !== src) {
        target.setAttribute('src', src);
      }

      if ('src' in target && target.src !== src) {
        try {
          target.src = src;
        } catch (error) {
          return;
        }
      }

      pendingAnimations.delete(target);
    }

    function isNearViewport(target) {
      if (!(target instanceof HTMLElement)) return false;
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      return rect.bottom >= -120 && rect.top <= viewportHeight + 220;
    }

    function flushPending() {
      frameQueued = false;

      pendingAnimations.forEach(function(target) {
        if (!(target instanceof HTMLElement) || !target.isConnected) {
          pendingAnimations.delete(target);
          return;
        }

        if (isNearViewport(target)) {
          markReady(target);
        }
      });
    }

    function scheduleFlush(immediate) {
      if (immediate) {
        flushPending();
        return;
      }

      if (frameQueued) return;
      frameQueued = true;
      window.requestAnimationFrame(flushPending);
    }

    function bindFallbacks() {
      if (fallbackBound) return;
      fallbackBound = true;

      window.addEventListener('scroll', function() {
        scheduleFlush(false);
      }, { passive: true });
      window.addEventListener('resize', function() {
        scheduleFlush(false);
      });
      window.addEventListener('load', function() {
        scheduleFlush(true);
      }, { once: true });
      window.addEventListener('pageshow', function() {
        scheduleFlush(true);
      });

      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          scheduleFlush(true);
        }
      });

      if (window.customElements && typeof window.customElements.whenDefined === 'function') {
        window.customElements.whenDefined('dotlottie-wc').then(function() {
          scheduleFlush(true);
        }).catch(function() {
          return;
        });
      }
    }

    function queueAnimation(animation) {
      if (!(animation instanceof HTMLElement) || animation.dataset.lazyObserved === 'true') return;

      const src = animation.getAttribute('data-lottie-src');
      if (!src) return;

      animation.dataset.lazyObserved = 'true';
      markReady(animation);
      pendingAnimations.add(animation);

      window.spotActivateWhenVisible(animation, function(target) {
        markReady(target);
      });
    }

    function scan(rootNode) {
      if (!rootNode) return;

      const scope = rootNode instanceof Document ? rootNode.documentElement : rootNode;
      if (!(scope instanceof Element)) return;

      if (scope.matches && scope.matches(selector)) {
        queueAnimation(scope);
      }

      scope.querySelectorAll(selector).forEach(function(animation) {
        queueAnimation(animation);
      });
    }

    bindFallbacks();
    scan(document);
    scheduleFlush(true);
    window.spotRefreshLazyAnimations = function(rootNode) {
      scan(rootNode || document);
      scheduleFlush(true);
    };
  }

  function initScrollReveals() {
    const selectors = [
      '.feature-card',
      '.vehicle-card',
      '.fleet-summary-card',
      '.fuel-metric-card',
      '.fuel-trend-card',
      '.fuel-chart-card',
      '.fuel-station-card',
      '.timetable-card',
      '.ai-card',
      '.route-iframe',
      '.route-btns-row',
      '.fare-form',
      '.fare-output',
      '.route-quickview',
      '.contact-form',
      '.about-item',
      '.about-stat',
      '.about-step',
      '.about-drawer',
      '.faq-item',
      '.driver-portal-card',
      '.driver-preview-card',
      '.drivers-table tbody tr'
    ];

    function decorateReveal(targets) {
      targets.forEach(function(target, index) {
        if (!(target instanceof HTMLElement) || target.dataset.revealReady === 'true') return;

        target.dataset.revealReady = 'true';
        target.style.setProperty('--reveal-order', String(index % 6));
        target.classList.add('scroll-reveal');

        window.spotActivateWhenVisible(target, function(node) {
          node.classList.add('is-visible');
        }, {
          rootMargin: '80px 0px',
          threshold: 0.08
        });
      });
    }

    function scan(rootNode) {
      if (!rootNode) return;

      const scope = rootNode instanceof Document ? rootNode.documentElement : rootNode;
      if (!(scope instanceof Element)) return;

      const matches = [];
      selectors.forEach(function(selector) {
        if (scope.matches && scope.matches(selector)) matches.push(scope);
        scope.querySelectorAll(selector).forEach(function(node) {
          matches.push(node);
        });
      });

      decorateReveal(matches);
    }

    scan(document);

    if (!('MutationObserver' in window)) return;

    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node instanceof HTMLElement) {
            scan(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.spotRefreshScrollReveals = function(rootNode) {
      scan(rootNode || document);
    };
  }

  function initPageAtmospheres() {
    const surfaces = Array.from(document.querySelectorAll('.main-content--atmosphere'));
    if (!surfaces.length) return;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    surfaces.forEach(function(surface) {
      if (!(surface instanceof HTMLElement)) return;
      surface.style.setProperty('--page-pointer-x', '52%');
      surface.style.setProperty('--page-pointer-y', '18%');
    });

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    surfaces.forEach(function(surface) {
      if (!(surface instanceof HTMLElement) || surface.dataset.atmosphereReady === 'true') return;

      surface.dataset.atmosphereReady = 'true';
      let frame = null;

      function setPointer(clientX, clientY) {
        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const x = clamp(((clientX - rect.left) / rect.width) * 100, 6, 94);
        const y = clamp(((clientY - rect.top) / rect.height) * 100, 6, 94);

        surface.style.setProperty('--page-pointer-x', x.toFixed(2) + '%');
        surface.style.setProperty('--page-pointer-y', y.toFixed(2) + '%');
      }

      surface.addEventListener('pointermove', function(event) {
        if (frame) cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function() {
          setPointer(event.clientX, event.clientY);
          frame = null;
        });
      });

      surface.addEventListener('pointerleave', function() {
        surface.style.setProperty('--page-pointer-x', '52%');
        surface.style.setProperty('--page-pointer-y', '18%');
      });
    });
  }

  function clearPageLoading() {
    if (pageLoadingCleared) return;
    pageLoadingCleared = true;
    window.setTimeout(function() {
      document.body.classList.remove('page-loading');
    }, 180);
  }

  if (document.readyState === 'complete') {
    clearPageLoading();
  } else {
    window.addEventListener('load', clearPageLoading, { once: true });
  }

  window.addEventListener('pageshow', clearPageLoading, { once: true });
  initLazyAnimations();
  initScrollReveals();
  initPageAtmospheres();

  function readStoredTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function writeStoredTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      return;
    }
  }

  let themeToggle = null;

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) writeStoredTheme(theme);
    if (themeToggle) {
      const isDark = theme === 'dark';
      themeToggle.dataset.theme = theme;
      themeToggle.setAttribute('aria-pressed', String(isDark));
      themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      themeToggle.innerHTML = `
        <span class="theme-toggle__track" aria-hidden="true">
          <span class="theme-toggle__thumb">${isDark ? '&#9790;' : '&#9728;'}</span>
        </span>
        <span class="theme-toggle__label">${isDark ? 'Dark mode' : 'Light mode'}</span>
      `;
    }
  }

  if (header) {
    let controls = header.querySelector('.header-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'header-controls';
      header.appendChild(controls);
    }

    themeToggle = document.createElement('button');
    themeToggle.type = 'button';
    themeToggle.className = 'theme-toggle';
    controls.appendChild(themeToggle);

    if (hamburger) {
      controls.appendChild(hamburger);
    }

    applyTheme(root.dataset.theme || 'light', false);

    themeToggle.addEventListener('click', function() {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true);
    });

  }

  if (nav) {
    if (!nav.id) nav.id = 'site-nav';
    nav.setAttribute('aria-hidden', window.innerWidth > 768 ? 'false' : 'true');
    nav.dataset.state = window.innerWidth > 768 ? 'open' : 'closed';
  }

  if (hamburger && nav) {
    hamburger.setAttribute('aria-controls', nav.id);
    if (!hamburger.hasAttribute('aria-expanded')) hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open menu');

    const navItems = Array.from(nav.querySelectorAll('.nav-item'));
    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'nav-scrim';
    scrim.setAttribute('aria-label', 'Close navigation');
    document.body.appendChild(scrim);

    navItems.forEach(function(item, index) {
      item.style.setProperty('--nav-index', String(index));
      const href = (item.getAttribute('href') || '').split('/').pop() || 'index.html';
      const current = window.location.pathname.split('/').pop() || 'index.html';
      if (href === current || (href === 'index.html' && current === '')) {
        item.classList.add('is-current');
        item.setAttribute('aria-current', 'page');
      }
    });

    function setMenuState(open, focusHamburger) {
      const shouldOpen = Boolean(open) && window.innerWidth <= 768;
      hamburger.classList.toggle('active', shouldOpen);
      header.classList.toggle('menu-open', shouldOpen);
      nav.classList.toggle('active', shouldOpen);
      nav.dataset.state = shouldOpen ? 'open' : 'closed';
      document.body.classList.toggle('nav-open', shouldOpen);
      scrim.classList.toggle('visible', shouldOpen);
      hamburger.setAttribute('aria-expanded', String(shouldOpen));
      hamburger.setAttribute('aria-label', shouldOpen ? 'Close menu' : 'Open menu');
      nav.setAttribute('aria-hidden', shouldOpen ? 'false' : (window.innerWidth > 768 ? 'false' : 'true'));
      if (shouldOpen) {
        const firstItem = navItems[0];
        if (firstItem) {
          window.requestAnimationFrame(function() {
            firstItem.focus();
          });
        }
      } else if (focusHamburger) {
        hamburger.focus();
      }
    }

    hamburger.addEventListener('click', function(event) {
      event.stopPropagation();
      setMenuState(!nav.classList.contains('active'), false);
    });

    nav.addEventListener('click', function(event) {
      if (event.target.closest('.nav-item')) {
        setMenuState(false, false);
      }
    });

    scrim.addEventListener('click', function() {
      setMenuState(false, true);
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && nav.classList.contains('active')) {
        setMenuState(false, true);
      }
    });

    window.addEventListener('resize', function() {
      if (window.innerWidth > 768) {
        setMenuState(false, false);
        nav.dataset.state = 'open';
        nav.setAttribute('aria-hidden', 'false');
      } else if (!nav.classList.contains('active')) {
        nav.dataset.state = 'closed';
        nav.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (scrollTopBtn) {
    scrollTopBtn.classList.remove('visible');
    const scrollState = { scrollingToTop: false, timer: null };

    function updateScrollButton() {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      if (scrollState.scrollingToTop) {
        scrollTopBtn.classList.add('visible');
        if (scrollY <= 8) {
          scrollState.scrollingToTop = false;
          if (scrollState.timer) clearTimeout(scrollState.timer);
          scrollState.timer = null;
          scrollTopBtn.classList.remove('visible');
        }
        return;
      }
      scrollTopBtn.classList.toggle('visible', scrollY > 140);
    }

    function scrollToTop(event) {
      event.preventDefault();
      scrollState.scrollingToTop = true;
      if (scrollState.timer) clearTimeout(scrollState.timer);
      scrollState.timer = setTimeout(function() {
        scrollState.scrollingToTop = false;
        updateScrollButton();
        scrollState.timer = null;
      }, 1400);
      const target = document.scrollingElement || document.documentElement || document.body;
      target.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateScrollButton();
    window.addEventListener('scroll', updateScrollButton);
    scrollTopBtn.addEventListener('click', scrollToTop);
    scrollTopBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        scrollToTop(event);
      }
    });
  }
});
