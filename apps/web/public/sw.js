/* La app ya no usa service worker. Este reemplaza al que pudo haber quedado instalado: borra su
   caché y se da de baja. Se puede borrar cuando ya no queden navegadores con el anterior. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
