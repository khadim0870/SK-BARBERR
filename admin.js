(() => {
  const ADMIN_TOKEN_KEY = "skbarber_admin_token_v1";

  const authSection = document.querySelector("#auth");
  const adminSection = document.querySelector("#admin");
  const authMessage = document.querySelector("#authMessage");

  const adminLoginForm = document.querySelector("#adminLoginForm");
  const adminEmailEl = document.querySelector("#adminEmail");
  const adminPasswordEl = document.querySelector("#adminPassword");

  const refreshBtn = document.querySelector("#refreshBtn");
  const logoutBtn = document.querySelector("#logoutBtn");

  const heroVideoSelect = document.querySelector("#heroVideoSelect");
  const heroVideoSave = document.querySelector("#heroVideoSave");
  const heroVideoStatus = document.querySelector("#heroVideoStatus");

  const bookingsListEl = document.querySelector("#bookingsList");
  const todayCountEl = document.querySelector("#todayCount");
  const pendingCountEl = document.querySelector("#pendingCount");
  const totalClientsEl = document.querySelector("#totalClients");

  const toLocalISODate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const setMessage = (type, text) => {
    if (!authMessage) return;
    authMessage.className = "message";
    if (type) authMessage.classList.add(type);
    authMessage.textContent = text || "";
  };

  const setHeroStatus = (type, text) => {
    if (!heroVideoStatus) return;
    heroVideoStatus.className = "message";
    if (type) heroVideoStatus.classList.add(type);
    heroVideoStatus.textContent = text || "";
  };

  const getToken = () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  const setToken = (token) => sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  const clearToken = () => sessionStorage.removeItem(ADMIN_TOKEN_KEY);

  const apiFetch = async (path, { method = "GET", body = null } = {}) => {
    const headers = { Accept: "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      const error = new Error("network_error");
      error.network = true;
      throw error;
    }

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const error = new Error("request_failed");
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  const showAdmin = () => {
    if (authSection) authSection.style.display = "none";
    if (adminSection) adminSection.style.display = "block";
  };

  const showAuth = () => {
    if (authSection) authSection.style.display = "block";
    if (adminSection) adminSection.style.display = "none";
  };

  const statusLabel = (status) => {
    if (status === "confirmed") return "confirmé";
    if (status === "cancelled") return "annulé";
    return "en attente";
  };

  const statusClass = (status) => {
    if (status === "confirmed") return "confirme";
    if (status === "cancelled") return "annule";
    return "";
  };

  const renderAdmin = (bookings) => {
    if (!bookingsListEl) return;

    const today = toLocalISODate();
    const todayCount = bookings.filter((b) => b.date === today && b.status !== "cancelled").length;
    const pendingCount = bookings.filter((b) => b.status === "pending").length;
    const uniqueClients = new Set(bookings.map((b) => b.client_email).filter(Boolean));

    if (todayCountEl) todayCountEl.textContent = String(todayCount);
    if (pendingCountEl) pendingCountEl.textContent = String(pendingCount);
    if (totalClientsEl) totalClientsEl.textContent = String(uniqueClients.size);

    bookingsListEl.innerHTML = "";

    for (const booking of bookings) {
      const tr = document.createElement("tr");

      const tdClient = document.createElement("td");
      tdClient.textContent = booking.client_name || "";

      const tdService = document.createElement("td");
      tdService.textContent = booking.service || "";

      const tdBarber = document.createElement("td");
      tdBarber.textContent = booking.barber || "";

      const tdDate = document.createElement("td");
      tdDate.textContent = booking.date || "";

      const tdTime = document.createElement("td");
      tdTime.textContent = booking.time || "";

      const statusSpan = document.createElement("span");
      statusSpan.className = "status";
      const cls = statusClass(booking.status);
      if (cls) statusSpan.classList.add(cls);
      statusSpan.textContent = statusLabel(booking.status);

      const tdStatus = document.createElement("td");
      tdStatus.appendChild(statusSpan);

      const tdActions = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "action-btn";
      confirmBtn.textContent = "Confirmer";
      confirmBtn.style.background = "#28a745";
      confirmBtn.style.color = "white";
      confirmBtn.disabled = booking.status === "confirmed" || booking.status === "cancelled";
      confirmBtn.addEventListener("click", async () => {
        await apiFetch(`/api/admin/bookings/${booking.id}`, { method: "PATCH", body: { status: "confirmed" } });
        await loadBookings();
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "action-btn cancel";
      cancelBtn.textContent = "Annuler";
      cancelBtn.disabled = booking.status === "cancelled";
      cancelBtn.addEventListener("click", async () => {
        await apiFetch(`/api/admin/bookings/${booking.id}`, { method: "PATCH", body: { status: "cancelled" } });
        await loadBookings();
      });

      const pendingBtn = document.createElement("button");
      pendingBtn.type = "button";
      pendingBtn.className = "action-btn delete";
      pendingBtn.textContent = "En attente";
      pendingBtn.disabled = booking.status === "pending";
      pendingBtn.addEventListener("click", async () => {
        await apiFetch(`/api/admin/bookings/${booking.id}`, { method: "PATCH", body: { status: "pending" } });
        await loadBookings();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "action-btn delete";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", async () => {
        await apiFetch(`/api/admin/bookings/${booking.id}`, { method: "DELETE" });
        await loadBookings();
      });

      actions.append(confirmBtn, cancelBtn, pendingBtn, deleteBtn);
      tdActions.appendChild(actions);

      tr.append(tdClient, tdService, tdBarber, tdDate, tdTime, tdStatus, tdActions);
      bookingsListEl.appendChild(tr);
    }
  };

  const loadBookings = async () => {
    const data = await apiFetch("/api/admin/bookings");
    renderAdmin(data.bookings || []);
  };

  const loadHeroVideoOptions = async () => {
    if (!heroVideoSelect) return;
    const manifest = await apiFetch("/assets/videos/manifest.json");
    const items = Array.isArray(manifest) ? manifest : [];

    heroVideoSelect.innerHTML = "";
    for (const item of items) {
      const src = typeof item === "string" ? item : String(item?.src || "");
      const caption = typeof item === "string" ? "" : String(item?.caption || "");
      if (!src) continue;
      const opt = document.createElement("option");
      opt.value = src;
      opt.textContent = caption ? `${caption} — ${src}` : src;
      heroVideoSelect.appendChild(opt);
    }
  };

  const loadCurrentHeroVideo = async () => {
    if (!heroVideoSelect) return;
    const data = await apiFetch("/api/public/settings");
    const src = String(data?.heroVideoSrc || "").trim();
    if (!src) return;
    heroVideoSelect.value = src;
  };

  const saveHeroVideo = async () => {
    if (!heroVideoSelect) return;
    const src = String(heroVideoSelect.value || "").trim();
    if (!src) return;
    await apiFetch("/api/admin/settings/hero-video", { method: "PATCH", body: { src } });
  };

  const login = async (email, password) => {
    const data = await apiFetch("/api/admin/login", { method: "POST", body: { email, password } });
    setToken(data.token);
  };

  const init = async () => {
    showAuth();
    setMessage("", "");

    logoutBtn?.addEventListener("click", () => {
      clearToken();
      showAuth();
      setMessage("success", "Déconnecté.");
    });

    refreshBtn?.addEventListener("click", () => {
      loadBookings().catch(() => {});
    });

    adminLoginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMessage("", "");

      const email = String(adminEmailEl?.value || "").trim().toLowerCase();
      const password = String(adminPasswordEl?.value || "");
      if (!email || !password) {
        setMessage("error", "Merci de remplir email et mot de passe.");
        return;
      }

      try {
        await login(email, password);
        showAdmin();
        setHeroStatus("", "");
        await loadHeroVideoOptions();
        await loadCurrentHeroVideo();
        await loadBookings();
      } catch (err) {
        if (err?.network) {
          setMessage(
            "error",
            "Serveur introuvable. Lance `npm start` (dossier `server`) et ouvre `http://localhost:3000/admin.html`."
          );
          return;
        }
        if (err?.status === 401) {
          setMessage("error", "Identifiants admin incorrects.");
          return;
        }
        setMessage("error", "Erreur serveur. Réessaie.");
      }
    });

    // Try existing session token
    if (getToken()) {
      try {
        showAdmin();
        setHeroStatus("", "");
        await loadHeroVideoOptions();
        await loadCurrentHeroVideo();
        await loadBookings();
      } catch {
        clearToken();
        showAuth();
      }
    }

    heroVideoSave?.addEventListener("click", async () => {
      setHeroStatus("", "");
      try {
        await saveHeroVideo();
        setHeroStatus("success", "Vidéo d'accueil mise à jour.");
      } catch (err) {
        if (err?.status === 401) setHeroStatus("error", "Session expirée. Reconnecte-toi.");
        else if (err?.status === 403) setHeroStatus("error", "Accès refusé (admin).");
        else setHeroStatus("error", "Impossible d'enregistrer.");
      }
    });
  };

  init().catch(() => {});
})();
