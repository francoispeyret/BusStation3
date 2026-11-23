(() => {
  'use strict';

  function create(container, status) {
    const queue = [];
    function display({type, title, unit, message, announcement}) {
      const card = document.createElement('div');
      card.className = 'notice-card';
      const headline = document.createElement('strong');
      headline.className = 'notice-headline';
      headline.textContent = title;
      if (unit) {
        const suffix = document.createElement('small');
        suffix.textContent = unit;
        headline.append(suffix);
      }
      const caption = document.createElement('span');
      caption.className = 'notice-caption';
      caption.textContent = message;
      card.append(headline, caption);
      container.dataset.type = type;
      container.replaceChildren(card);
      status.replaceChildren(announcement || [title, unit, message].filter(Boolean).join(' '));
    }
    container.addEventListener('animationend', event => {
      if (event.target !== container.firstElementChild) return;
      if (queue.length) display(queue.shift());
      else container.replaceChildren();
    });
    return {
      push(notice) {
        if (container.firstElementChild) queue.push(notice);
        else display(notice);
      },
      clear() {
        queue.length = 0;
        container.replaceChildren();
        status.replaceChildren();
      }
    };
  }
  window.BusNotices = {create};
})();
