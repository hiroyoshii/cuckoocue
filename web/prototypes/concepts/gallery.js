const { concepts, screens } = window.conceptCatalog;
document.querySelector('#concepts').innerHTML = concepts.map((concept) => `<article><h2>${concept.name}</h2><p>${concept.description}</p><p class="tradeoff">${concept.tradeoff}</p><a class="open" href="app.html?concept=${concept.id}&screen=start">この案を操作する</a></article>`).join('');
document.querySelector('#jump').innerHTML = screens.map(([screen, label]) => `<option value="${screen}">${label}</option>`).join('');
function gallery() {
  const viewport = document.querySelector('#viewport').value;
  document.body.dataset.viewport = viewport;
  document.querySelector('#gallery').innerHTML = screens.map(([screen, label]) => `<section class="screen-row" id="${screen}"><h2>${label}</h2><div class="screen-grid">${concepts.map((concept) => {
    const image = `../../../docs/review-screenshots/web/three-concepts/${concept.id}/${screen}-${viewport}.png`;
    return `<figure><a href="${image}" target="_blank" rel="noopener"><img loading="lazy" src="${image}" alt="${concept.name} ${label} ${viewport}"></a><figcaption><strong>${concept.name}</strong><a href="app.html?concept=${concept.id}&screen=${screen}">この画面を操作</a></figcaption></figure>`;
  }).join('')}</div></section>`).join('');
}
document.querySelector('#viewport').addEventListener('change', gallery);
document.querySelector('#jump').addEventListener('change', (event) => document.getElementById(event.target.value).scrollIntoView());
gallery();
