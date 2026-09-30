// Shared behaviour for the guides: syntax highlighting, copy buttons, Mermaid diagrams, and a
// zoom viewer for every diagram and image.
//
// A classic script, not a module: browsers refuse to load a local module when a guide is
// opened straight from disk (file://). Mermaid is pulled in with a dynamic import from the
// CDN, which works from disk too. highlight.js is loaded by a <script> tag before this one.
(async () => {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  for (const block of document.querySelectorAll('pre > code[class*="language-"]')) {
    window.hljs?.highlightElement(block);

    const button = document.createElement('button');
    button.className = 'copy';
    button.type = 'button';
    button.textContent = 'copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(block.innerText);
        button.textContent = 'copied';
      } catch {
        button.textContent = 'select + copy';
      }
      setTimeout(() => (button.textContent = 'copy'), 1500);
    });
    block.parentElement.append(button);
  }

  // Images can be zoomed straight away; diagrams once Mermaid has drawn them.
  for (const img of document.querySelectorAll('main img')) makeZoomable(img, () => img);

  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.esm.min.mjs');
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'neutral',
    fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    securityLevel: 'strict',
  });
  await mermaid.run({ querySelector: 'pre.mermaid' });

  for (const figure of document.querySelectorAll('figure.diagram')) {
    makeZoomable(figure, () => figure.querySelector('svg, img'));
  }
})();

// --- Zoom viewer ----------------------------------------------------------------------

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;

/** Opens the viewer on the element `pick()` returns when `trigger` is clicked or activated. */
function makeZoomable(trigger, pick) {
  trigger.classList.add('zoomable');
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-label', 'Open diagram full screen to zoom');
  trigger.title = 'Click to zoom';

  const open = () => {
    const source = pick();
    if (source) viewer().open(source, trigger);
  };
  trigger.addEventListener('click', (event) => {
    if (!event.target.closest('a')) open();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

let viewerInstance = null;

/** The one viewer on the page, built on first use. */
function viewer() {
  viewerInstance ??= createViewer();
  return viewerInstance;
}

function createViewer() {
  const overlay = document.createElement('div');
  overlay.className = 'zoom-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Zoomed diagram');
  overlay.innerHTML = `
    <div class="zoom-toolbar">
      <button type="button" data-zoom="out" title="Zoom out (−)" aria-label="Zoom out">−</button>
      <span class="zoom-level" aria-live="polite">100%</span>
      <button type="button" data-zoom="in" title="Zoom in (+)" aria-label="Zoom in">+</button>
      <button type="button" data-zoom="fit" title="Fit to screen (0)">Fit</button>
      <button type="button" data-zoom="close" title="Close (Esc)" aria-label="Close">✕</button>
    </div>
    <div class="zoom-stage"><div class="zoom-content"></div></div>
    <div class="zoom-hint">Scroll or pinch to zoom · drag to move · Esc to close</div>`;
  document.body.append(overlay);

  const stage = overlay.querySelector('.zoom-stage');
  const content = overlay.querySelector('.zoom-content');
  const level = overlay.querySelector('.zoom-level');

  let scale = 1;
  let x = 0;
  let y = 0;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let returnFocus = null;
  const pointers = new Map();
  let pinchStart = null;

  const apply = () => {
    content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    level.textContent = `${Math.round(scale * 100)}%`;
  };

  /** Scales to `next`, keeping the stage point (px, py) still under the pointer. */
  const zoomTo = (next, px = stage.clientWidth / 2, py = stage.clientHeight / 2) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    x = px - ((px - x) * clamped) / scale;
    y = py - ((py - y) * clamped) / scale;
    scale = clamped;
    apply();
  };

  const fit = () => {
    const margin = 32;
    scale = Math.min(
      (stage.clientWidth - margin * 2) / naturalWidth,
      (stage.clientHeight - margin * 2) / naturalHeight,
      MAX_SCALE
    );
    x = (stage.clientWidth - naturalWidth * scale) / 2;
    y = (stage.clientHeight - naturalHeight * scale) / 2;
    apply();
  };

  const close = () => {
    overlay.hidden = true;
    content.replaceChildren();
    document.documentElement.classList.remove('zoom-open');
    returnFocus?.focus();
  };

  overlay.querySelector('.zoom-toolbar').addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.zoom;
    if (action === 'in') zoomTo(scale * STEP);
    if (action === 'out') zoomTo(scale / STEP);
    if (action === 'fit') fit();
    if (action === 'close') close();
  });

  // On the document, not the overlay: a click on the backdrop moves focus to <body>.
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === '+' || event.key === '=') zoomTo(scale * STEP);
    else if (event.key === '-' || event.key === '_') zoomTo(scale / STEP);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  });

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      // Trackpad pinch arrives as a wheel event with ctrlKey and small deltas.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      zoomTo(scale * factor, event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false }
  );

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
    stage.classList.add('dragging');
  });

  stage.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);

    if (pointers.size === 1) {
      x += current.x - previous.x;
      y += current.y - previous.y;
      apply();
    } else if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const rect = stage.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(
        (pinchStart.scale * distance) / pinchStart.distance,
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top
      );
    }
  });

  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // A click on the empty backdrop closes. A drag that starts or ends there does not.
  let down = null;
  stage.addEventListener('pointerdown', (event) => {
    down = event.target === stage ? { x: event.clientX, y: event.clientY, travel: 0 } : null;
  });
  stage.addEventListener('pointermove', (event) => {
    if (down) down.travel = Math.max(down.travel, Math.hypot(event.clientX - down.x, event.clientY - down.y));
  });
  stage.addEventListener('click', (event) => {
    if (down && down.travel < 4 && event.target === stage) close();
  });

  return {
    open(source, trigger) {
      returnFocus = trigger;
      const clone = source.cloneNode(true);
      const box = source.getBoundingClientRect();
      // Mermaid caps its SVG with max-width; the clone is drawn at its natural size and
      // scaled by the transform instead, so it stays sharp at every zoom level.
      const viewBox = source.viewBox?.baseVal;
      naturalWidth = viewBox?.width || source.naturalWidth || box.width;
      naturalHeight = viewBox?.height || source.naturalHeight || box.height;
      clone.removeAttribute('style');
      clone.style.width = `${naturalWidth}px`;
      clone.style.height = `${naturalHeight}px`;
      clone.style.maxWidth = 'none';
      content.replaceChildren(clone);

      overlay.hidden = false;
      document.documentElement.classList.add('zoom-open');
      fit();
      overlay.querySelector('[data-zoom="close"]').focus();
    },
  };
}
