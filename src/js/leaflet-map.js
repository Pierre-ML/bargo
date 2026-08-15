(function () {
  var maps = document.querySelectorAll('[data-leaflet-map]');
  if (!maps.length) return;

  if (!document.querySelector('link[href*="leaflet"]')) {
    var link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  function setupAllMaps() {
    maps.forEach(function (mapEl) {
      if (mapEl._leafletInit) return;
      mapEl._leafletInit = true;

      var lat  = parseFloat(mapEl.dataset.lat);
      var lon  = parseFloat(mapEl.dataset.lon);
      var name = mapEl.dataset.name || 'BARGO';
      var zoom = parseInt(mapEl.dataset.zoom) || 16;

      if (!lat || !lon) return;

      mapEl.innerHTML = '';
      var map = L.map(mapEl).setView([lat, lon], zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      L.marker([lat, lon])
        .addTo(map)
        .bindPopup('<strong style="color:#347645">' + name + '</strong>')
        .openPopup();
      mapEl._leafletMap = map;
    });
  }

  if (window.L) {
    setupAllMaps();
  } else {
    var existing = document.querySelector('script[src*="leaflet"]');
    if (existing) {
      existing.addEventListener('load', setupAllMaps);
    } else {
      var script = document.createElement('script');
      script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = setupAllMaps;
      document.head.appendChild(script);
    }
  }
})();
