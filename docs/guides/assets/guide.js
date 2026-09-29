// Shared behaviour for the guides: syntax highlighting, copy buttons, and Mermaid diagrams.
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

  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.esm.min.mjs');
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'neutral',
    fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    securityLevel: 'strict',
  });
  await mermaid.run({ querySelector: 'pre.mermaid' });
})();
