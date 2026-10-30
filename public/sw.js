self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "SahayAI nearby help", body: "Open SahayAI to view the request." }; }
  event.waitUntil(self.registration.showNotification(data.title || "Someone nearby may need help", {
    body: data.body || "Open SahayAI to view the request.",
    tag: "sahayai-nearby-help",
    data: data.data || { url: "/" },
    requireInteraction: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return self.clients.openWindow(target);
  }));
});

