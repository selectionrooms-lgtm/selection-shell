self.addEventListener('fetch', function (event) {
    // Pustamo sajt da normalno vuče sve podatke sa interneta
    event.respondWith(fetch(event.request));
});