(function () {
  'use strict';

  const feed = document.querySelector('.shorts-feed');
  if (!feed) return;

  const baseUrl = feed.dataset.baseUrl;
  let page = 1;
  let loading = false;
  let exhausted = false;

  /* Sentinel div — triggers load when scrolled into view */
  const sentinel = document.createElement('div');
  sentinel.className = 'shorts-sentinel';
  feed.after(sentinel);

  /* Status indicator */
  const status = document.createElement('p');
  status.className = 'shorts-loader';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  sentinel.after(status);

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    status.hidden = false;
    status.textContent = 'Načítám…';

    page++;

    try {
      const res = await fetch(`${baseUrl}${page}/`);
      if (!res.ok) { exhausted = true; status.hidden = true; return; }

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const items = doc.querySelectorAll('.short-item');

      if (items.length === 0) {
        exhausted = true;
        status.hidden = true;
        return;
      }

      const fragment = document.createDocumentFragment();
      items.forEach(item => fragment.appendChild(document.adoptNode(item)));
      feed.appendChild(fragment);
      status.hidden = true;

    } catch {
      status.textContent = 'Chyba při načítání.';
    } finally {
      loading = false;
    }
  }

  const observer = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMore(); },
    { rootMargin: '300px' }
  );

  observer.observe(sentinel);
})();
