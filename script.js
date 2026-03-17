(() => {
  const TOKEN_KEY = "skbarber_client_token_v1";
  const USER_KEY = "skbarber_client_user_v1";
  const MY_BOOKINGS_SEEN_KEY = "skbarber_my_bookings_seen_v1";

  const API_BASE = (() => {
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const port = String(window.location.port || "");
    // If you opened the site with Live Server (often :5500), use the backend on :3000.
    // Backend dev CORS is enabled for localhost origins.
    if (isLocal && port && port !== "3000") return "http://localhost:3000";
    return "";
  })();

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const navbarMenu = $(".nav-menu");
  const hamburger = $(".hamburger");

  const bookingLockedEl = $("#bookingLocked");
  const bookingForm = $("#bookingForm");
  const messageEl = $("#message");
  const timeSlotsEl = $("#timeSlots");

  const nameEl = $("#name");
  const emailEl = $("#email");
  const phoneEl = $("#phone");
  const serviceEl = $("#service");
  const barberEl = $("#barber");
  const dateEl = $("#date");
  const timeEl = $("#time");
  const notesEl = $("#notes");

  // Client auth UI
  const clientLoggedOutEl = $("#clientLoggedOut");
  const clientLoggedInEl = $("#clientLoggedIn");
  const clientWhoEl = $("#clientWho");
  const clientAuthMessageEl = $("#clientAuthMessage");
  const clientAuthForm = $("#clientAuthForm");
  const clientLogoutBtn = $("#clientLogoutBtn");
  const clientFirstNameEl = $("#clientFirstName");
  const clientLastNameEl = $("#clientLastName");
  const clientEmailEl = $("#clientEmail");
  const clientPhoneEl = $("#clientPhone");
  const clientPasswordEl = $("#clientPassword");

  // My bookings
  const myBookingsSection = $("#myBookings");
  const myBookingsListEl = $("#myBookingsList");
  const myBookingsMessageEl = $("#myBookingsMessage");
  const myBookingsRefreshBtn = $("#myBookingsRefresh");

  const timeOptions = () =>
    $$("#time option")
      .map((o) => o.value)
      .filter(Boolean);

  const toLocalISODate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const normalizePhone = (value) => String(value || "").replace(/\s+/g, "").trim();

  const setMessage = (type, text) => {
    if (!messageEl) return;
    messageEl.className = "message";
    if (type) messageEl.classList.add(type);
    messageEl.textContent = text || "";
  };

  const setAuthMessage = (type, text) => {
    if (!clientAuthMessageEl) return;
    clientAuthMessageEl.className = "message";
    if (type) clientAuthMessageEl.classList.add(type);
    clientAuthMessageEl.textContent = text || "";
  };

  const setMyBookingsMessage = (type, text) => {
    if (!myBookingsMessageEl) return;
    myBookingsMessageEl.className = "message";
    if (type) myBookingsMessageEl.classList.add(type);
    myBookingsMessageEl.textContent = text || "";
  };

  const getToken = () => sessionStorage.getItem(TOKEN_KEY) || "";
  const setToken = (token) => sessionStorage.setItem(TOKEN_KEY, token);
  const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

  const getUser = () => {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const setUser = (user) => sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  const clearUser = () => sessionStorage.removeItem(USER_KEY);

  const apiFetch = async (path, { method = "GET", body = null, auth = false } = {}) => {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
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
      error.nonJson = Boolean(text && !data);
      throw error;
    }

    return data;
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

  const renderClientState = async () => {
    const user = getUser();
    const loggedIn = Boolean(user?.email && getToken());

    if (clientLoggedOutEl) clientLoggedOutEl.style.display = loggedIn ? "none" : "block";
    if (clientLoggedInEl) clientLoggedInEl.style.display = loggedIn ? "block" : "none";
    if (clientWhoEl && loggedIn) clientWhoEl.textContent = user.name || user.email;

    if (bookingLockedEl) bookingLockedEl.style.display = loggedIn ? "none" : "block";
    if (bookingForm) bookingForm.style.display = loggedIn ? "block" : "none";
    if (myBookingsSection) myBookingsSection.style.display = loggedIn ? "block" : "none";

    if (loggedIn) {
      if (nameEl) {
        nameEl.value = user.name || "";
        nameEl.readOnly = true;
      }
      if (emailEl) {
        emailEl.value = user.email || "";
        emailEl.readOnly = true;
      }
      if (phoneEl) {
        phoneEl.value = user.phone || "";
        phoneEl.readOnly = true;
      }
    } else {
      if (nameEl) nameEl.readOnly = false;
      if (emailEl) emailEl.readOnly = false;
      if (phoneEl) phoneEl.readOnly = false;
    }

    await renderTimeSlots();
    if (loggedIn) await renderMyBookings();
  };

  const renderTimeSlots = async () => {
    if (!timeSlotsEl) return;

    const selectedDate = dateEl?.value || toLocalISODate();
    const selectedBarber = barberEl?.value || "";

    let booked = [];
    try {
      const query = new URLSearchParams();
      query.set("date", selectedDate);
      if (selectedBarber) query.set("barber", selectedBarber);
      const data = await apiFetch(`/api/bookings/availability?${query.toString()}`);
      booked = Array.isArray(data?.booked) ? data.booked : [];
    } catch {
      booked = [];
    }

    timeSlotsEl.innerHTML = "";
    for (const time of timeOptions()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-slot";
      button.textContent = time;

      const isBooked = booked.includes(time);
      if (isBooked) {
        button.classList.add("booked");
        button.disabled = true;
        button.title = "Créneau déjà réservé";
      } else {
        button.addEventListener("click", () => {
          if (timeEl) timeEl.value = time;
          setMessage("", "");
        });
      }
      timeSlotsEl.appendChild(button);
    }
  };

  const renderMyBookings = async () => {
    if (!myBookingsListEl) return;
    const token = getToken();
    if (!token) return;

    setMyBookingsMessage("", "");
    myBookingsListEl.innerHTML = "";

    let bookings = [];
    try {
      const data = await apiFetch("/api/bookings/me", { auth: true });
      bookings = Array.isArray(data?.bookings) ? data.bookings : [];
    } catch {
      setMyBookingsMessage("error", "Impossible de charger tes réservations.");
      return;
    }

    if (!bookings.length) {
      setMyBookingsMessage("error", "Aucune réservation pour le moment.");
      try {
        sessionStorage.setItem(MY_BOOKINGS_SEEN_KEY, JSON.stringify({}));
      } catch {
        // ignore
      }
      return;
    }

    // Notify status changes (this tab)
    try {
      const prevRaw = sessionStorage.getItem(MY_BOOKINGS_SEEN_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      const next = {};
      for (const b of bookings) next[b.id] = b.status;
      sessionStorage.setItem(MY_BOOKINGS_SEEN_KEY, JSON.stringify(next));

      if (prev && typeof prev === "object") {
        const confirmed = [];
        const cancelled = [];
        for (const b of bookings) {
          const before = prev[b.id];
          const after = next[b.id];
          if (!before || before === after) continue;
          const label = `${b.service || ""} - ${b.date || ""} ${b.time || ""}`.trim();
          if (after === "confirmed") confirmed.push(label);
          if (after === "cancelled") cancelled.push(label);
        }
        if (confirmed.length) {
          setMyBookingsMessage(
            "success",
            `Bonne nouvelle : réservation confirmée (${confirmed.slice(0, 2).join(" / ")}${
              confirmed.length > 2 ? "..." : ""
            }).`
          );
        } else if (cancelled.length) {
          setMyBookingsMessage(
            "error",
            `Réservation annulée (${cancelled.slice(0, 2).join(" / ")}${cancelled.length > 2 ? "..." : ""}).`
          );
        }
      }
    } catch {
      // ignore
    }

    for (const booking of bookings) {
      const tr = document.createElement("tr");

      const tdService = document.createElement("td");
      tdService.textContent = booking.service || "";

      const tdBarber = document.createElement("td");
      tdBarber.textContent = booking.barber || "";

      const tdDate = document.createElement("td");
      tdDate.textContent = booking.date || "";

      const tdTime = document.createElement("td");
      tdTime.textContent = booking.time || "";

      const tdStatus = document.createElement("td");
      const statusSpan = document.createElement("span");
      statusSpan.className = "status";
      const cls = statusClass(booking.status);
      if (cls) statusSpan.classList.add(cls);
      statusSpan.textContent = statusLabel(booking.status);
      tdStatus.appendChild(statusSpan);

      tr.append(tdService, tdBarber, tdDate, tdTime, tdStatus);
      myBookingsListEl.appendChild(tr);
    }
  };
  const initClientAuth = () => {
    if (!clientAuthForm) return;

    const authModeLoginBtn = $("#authModeLogin");
    const authModeRegisterBtn = $("#authModeRegister");
    const registerFieldsEl = $("#registerFields");
    const submitBtn = $("#clientAuthSubmit");

    let authMode = "login";

    const setModeUi = (mode) => {
      authMode = mode === "register" ? "register" : "login";
      const isRegister = authMode === "register";

      authModeLoginBtn?.classList.toggle("active", !isRegister);
      authModeLoginBtn?.setAttribute("aria-selected", String(!isRegister));
      authModeRegisterBtn?.classList.toggle("active", isRegister);
      authModeRegisterBtn?.setAttribute("aria-selected", String(isRegister));

      if (registerFieldsEl) registerFieldsEl.hidden = !isRegister;

      const toggleField = (el) => {
        if (!el) return;
        el.disabled = !isRegister;
        el.required = isRegister;
        if (!isRegister) el.value = "";
      };

      toggleField(clientFirstNameEl);
      toggleField(clientLastNameEl);
      toggleField(clientPhoneEl);

      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-user-check"></i> Continuer';
      }
    };

    authModeLoginBtn?.addEventListener("click", () => {
      setAuthMessage("", "");
      setModeUi("login");
    });

    authModeRegisterBtn?.addEventListener("click", () => {
      setAuthMessage("", "");
      setModeUi("register");
    });

    // Default: simple login (email + mot de passe)
    setModeUi("login");

    clientAuthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthMessage("", "");

      const email = String(clientEmailEl?.value || "").trim().toLowerCase();
      const password = String(clientPasswordEl?.value || "");

      if (authMode === "login") {
        if (!email || !password) {
          setAuthMessage("error", "Merci de remplir email et mot de passe.");
          return;
        }
      } else {
        const firstName = String(clientFirstNameEl?.value || "").trim();
        const lastName = String(clientLastNameEl?.value || "").trim();
        const phone = normalizePhone(clientPhoneEl?.value || "");

        if (!firstName || !lastName || !phone || !email || !password) {
          setAuthMessage("error", "Merci de remplir tous les champs.");
          return;
        }
      }

      try {
        const firstName = String(clientFirstNameEl?.value || "").trim();
        const lastName = String(clientLastNameEl?.value || "").trim();
        const phone = normalizePhone(clientPhoneEl?.value || "");

        const data = await apiFetch(authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
          method: "POST",
          body:
            authMode === "register"
              ? { firstName, lastName, phone, email, password }
              : { email, password },
        });

        setToken(data.token);
        setUser(data.user);
        setAuthMessage("success", authMode === "register" ? "Compte créé." : "Connexion réussie.");
        await renderClientState();
      } catch (err) {
        if (err?.network) {
          setAuthMessage(
            "error",
            "Serveur introuvable. Lance `npm start` (dossier `server`) et ouvre le site via http://localhost:3000/."
          );
          return;
        }

        const host = String(window.location.hostname || "").toLowerCase();
        const isLocal = host === "localhost" || host === "127.0.0.1";
        const port = String(window.location.port || "");
        if (isLocal && port && port !== "3000" && (err?.nonJson || err?.status === 404)) {
          setAuthMessage("error", "Tu as ouvert le site avec Live Server. Ouvre plutôt http://localhost:3000/.");
          return;
        }

        if (err?.nonJson || err?.status === 404) {
          setAuthMessage(
            "error",
            "API introuvable. Redémarre le serveur (`cd server` puis `npm start`) et ouvre http://localhost:3000/."
          );
          console.error("Auth failed (non-json or 404):", err);
          return;
        }

        const code = err?.data?.error;
        if (code === "invalid_credentials") setAuthMessage("error", "Email ou mot de passe incorrect.");
        else if (code === "email_exists") setAuthMessage("error", "Cet email existe déjà. Connecte-toi.");
        else if (code === "weak_password") setAuthMessage("error", "Mot de passe trop court (min 6).");
        else if (code === "not_a_client") setAuthMessage("error", "Ce compte n'est pas autorisé ici.");
        else if (err?.status >= 500)
          setAuthMessage("error", "Erreur serveur. Vérifie que le backend tourne et que DATABASE_URL est correct.");
        else {
          setAuthMessage("error", "Impossible de se connecter.");
          console.error("Auth failed:", err);
        }
      }
    });

    clientLogoutBtn?.addEventListener("click", async () => {
      clearToken();
      clearUser();
      try {
        sessionStorage.removeItem(MY_BOOKINGS_SEEN_KEY);
      } catch {
        // ignore
      }
      setAuthMessage("", "");
      setMessage("", "");
      setMyBookingsMessage("", "");
      if (myBookingsListEl) myBookingsListEl.innerHTML = "";
      await renderClientState();
    });
  };
  const initForm = () => {
    if (dateEl) {
      const today = toLocalISODate();
      dateEl.min = today;
      if (!dateEl.value) dateEl.value = today;
    }

    ["change", "input"].forEach((evt) => {
      dateEl?.addEventListener(evt, renderTimeSlots);
      barberEl?.addEventListener(evt, renderTimeSlots);
    });

    if (!bookingForm) return;
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMessage("", "");

      if (!getToken()) {
        setMessage("error", "Connecte-toi pour réserver.");
        return;
      }

      const service = serviceEl?.value || "";
      const barber = barberEl?.value || "";
      const date = dateEl?.value || "";
      const time = timeEl?.value || "";
      const notes = notesEl?.value.trim() || "";

      if (!service || !barber || !date || !time) {
        setMessage("error", "Merci de remplir tous les champs obligatoires.");
        return;
      }

      try {
        await apiFetch("/api/bookings", {
          method: "POST",
          auth: true,
          body: { service, barber, date, time, notes },
        });
        setMessage("success", "Réservation enregistrée ! (Statut : en attente)");

        bookingForm.reset();
        const user = getUser();
        if (user?.email && getToken()) {
          if (nameEl) nameEl.value = user.name || "";
          if (emailEl) emailEl.value = user.email || "";
          if (phoneEl) phoneEl.value = user.phone || "";
        }
        if (dateEl) dateEl.value = toLocalISODate();
        await renderTimeSlots();
        await renderMyBookings();
      } catch (err) {
        const code = err?.data?.error;
        if (code === "slot_taken") setMessage("error", "Ce créneau est déjà pris. Choisis une autre heure.");
        else if (err?.status === 401) setMessage("error", "Session expirée. Reconnecte-toi.");
        else setMessage("error", "Erreur lors de la réservation.");
        await renderTimeSlots();
      }
    });
  };

  const initHamburgerMenu = () => {
    if (!hamburger || !navbarMenu) return;

    const toggle = () => {
      navbarMenu.classList.toggle("active");
    };

    hamburger.setAttribute("role", "button");
    hamburger.setAttribute("tabindex", "0");

    hamburger.addEventListener("click", toggle);
    hamburger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    $$(".nav-menu a").forEach((a) => {
      a.addEventListener("click", () => navbarMenu.classList.remove("active"));
    });
  };

  const initQuickReserveFromServices = () => {
    const reservationSection = document.querySelector("#reservation");
    const quickButtons = document.querySelectorAll("[data-service]");
    if (!quickButtons.length || !serviceEl) return;

    quickButtons.forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e?.preventDefault) e.preventDefault();
        const service = el.getAttribute("data-service") || "";
        if (service) {
          const option = Array.from(serviceEl.options).find((o) => o.value === service);
          if (option) serviceEl.value = option.value;
        }

        setMessage("", "");
        renderTimeSlots();

        if (reservationSection) {
          reservationSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        setTimeout(() => {
          const user = getUser();
          if (user?.email && getToken()) {
            if (barberEl) barberEl.focus({ preventScroll: true });
          } else if (clientFirstNameEl) {
            clientFirstNameEl.focus({ preventScroll: true });
          }
        }, 250);
      });
    });
  };

  const initMyBookings = () => {
    myBookingsRefreshBtn?.addEventListener("click", renderMyBookings);

    setInterval(() => {
      const user = getUser();
      if (!user?.email || !getToken()) return;
      renderMyBookings();
    }, 15000);
  };

  const initVideos = async () => {
    const videoGrid = $("#videoGrid");
    const section = $("section.videos");
    if (!section) return;

    const targetRate = 1.25;
    const tryPlay = (v) => {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // ignore autoplay restrictions
      }
    };

    const applyVideoDefaults = (v) => {
      v.muted = true;
      v.defaultMuted = true;
      v.volume = 0;
      v.autoplay = true;
      v.loop = true;
      v.playsInline = true;
      v.defaultPlaybackRate = targetRate;
      v.playbackRate = targetRate;

      v.addEventListener("play", () => {
        v.muted = true;
        v.volume = 0;
        v.playbackRate = targetRate;
      });
    };

    const resolveAssetPath = (item) => {
      if (item.path) return String(item.path);
      const src = String(item.src || "");
      if (src.startsWith("assets/")) return src;
      if (src.includes("/")) return `assets/${src}`;
      return `assets/videos/${src}`;
    };

    const inferKind = (item) => {
      const kind = String(item.kind || "").toLowerCase();
      if (kind === "image" || kind === "video") return kind;
      const p = resolveAssetPath(item).toLowerCase();
      if (p.endsWith(".mp4") || p.endsWith(".webm")) return "video";
      return "image";
    };

    const makeCard = (item) => {
      const srcPath = resolveAssetPath(item);
      const caption = String(item.caption || item.src || "").trim();
      const kind = inferKind(item);

      const card = document.createElement("div");
      card.className = "video-card";

      let video = null;
      if (kind === "video") {
        video = document.createElement("video");
        video.controls = true;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.setAttribute("playsinline", "");
        video.preload = "metadata";
        video.poster = "assets/image/video-poster.svg";

        const source = document.createElement("source");
        source.src = srcPath;
        source.type = srcPath.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
        video.appendChild(source);

        applyVideoDefaults(video);
      } else {
        const img = document.createElement("img");
        img.className = "media-img";
        img.src = srcPath;
        img.alt = caption || "Galerie";
        img.loading = "lazy";
        card.appendChild(img);
      }

      const p = document.createElement("p");
      p.className = "video-caption";
      p.textContent = caption || (kind === "image" ? "Galerie" : "Vidéo");

      if (video) card.append(video, p);
      else card.append(p);

      return { card, video };
    };

    const normalizeManifest = (data) => {
      if (!Array.isArray(data)) return [];
      return data
        .map((item) => {
          if (typeof item === "string") return { src: item, caption: "" };
          if (!item || typeof item !== "object") return null;
          const src = String(item.src || "").trim();
          const path = String(item.path || "").trim();
          const kind = String(item.kind || "").trim();
          const caption = String(item.caption || "").trim();

          // Accept either {src: "..."} (video) or {path: "...", kind:"image"} (image)
          if (!src && !path) return null;
          return { ...item, src, path, kind, caption };
        })
        .filter(Boolean);
    };

    let videos = [];
    if (videoGrid) {
      try {
        const manifest = await apiFetch("/assets/videos/manifest.json");
        const items = normalizeManifest(manifest);
        const galleryItems = items.filter((item) => {
          if (inferKind(item) !== "video") return false;
          const p = resolveAssetPath(item).toLowerCase();
          // Keep wa-014 only for the homepage hero (not inside the gallery grid)
          return !p.endsWith("/wa-014.mp4");
        });

        videoGrid.innerHTML = "";
        const created = galleryItems.map(makeCard);
        created.forEach(({ card }) => videoGrid.appendChild(card));
        videos = created.map(({ video }) => video).filter(Boolean);
      } catch {
        // Fallback: keep any existing markup
        videos = $$("section.videos video");
        videos.forEach(applyVideoDefaults);
      }
    } else {
      videos = $$("section.videos video");
      videos.forEach(applyVideoDefaults);
    }

    if (!videos.length) return;

    // Autoplay only what is visible to reduce CPU on lots of videos
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const v = entry.target;
                if (entry.isIntersecting) tryPlay(v);
                else v.pause();
              }
            },
            { threshold: 0.25 }
          )
        : null;

    for (const v of videos) {
      v.addEventListener("loadeddata", () => tryPlay(v));
      v.addEventListener("canplay", () => tryPlay(v));
      if (io) io.observe(v);
      tryPlay(v);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      for (const v of videos) tryPlay(v);
    });
  };

  const initHeroVideo = () => {
    const v = $(".hero-bg-video");
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
    v.loop = true;
    v.playsInline = true;

    const tryPlay = () => {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // ignore autoplay restrictions
      }
    };

    apiFetch("/api/public/settings")
      .then((data) => {
        const src = String(data?.heroVideoSrc || "").trim();
        if (!src) return;
        v.src = `assets/videos/${src}`;
        v.load();
        tryPlay();
      })
      .catch(() => {});

    v.addEventListener("loadeddata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    tryPlay();
  };

  const init = async () => {
    initHamburgerMenu();
    initClientAuth();
    initForm();
    initQuickReserveFromServices();
    initMyBookings();
    await initVideos();
    initHeroVideo();
    await renderClientState();
  };

  init().catch(() => {});
})();
