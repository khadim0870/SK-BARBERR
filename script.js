(() => {
  const TOKEN_KEY = "skbarber_client_token_v1";
  const USER_KEY = "skbarber_client_user_v1";
  const MY_BOOKINGS_SEEN_KEY = "skbarber_my_bookings_seen_v1";

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

    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const error = new Error("request_failed");
      error.status = res.status;
      error.data = data;
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

    clientAuthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthMessage("", "");

      const firstName = String(clientFirstNameEl?.value || "").trim();
      const lastName = String(clientLastNameEl?.value || "").trim();
      const phone = normalizePhone(clientPhoneEl?.value || "");
      const email = String(clientEmailEl?.value || "").trim().toLowerCase();
      const password = String(clientPasswordEl?.value || "");

      if (!firstName || !lastName || !phone || !email || !password) {
        setAuthMessage("error", "Merci de remplir tous les champs.");
        return;
      }

      try {
        const data = await apiFetch("/api/auth/continue", {
          method: "POST",
          body: { firstName, lastName, phone, email, password },
        });
        setToken(data.token);
        setUser(data.user);
        setAuthMessage("success", data.mode === "register" ? "Compte créé." : "Connexion réussie.");
        await renderClientState();
      } catch (err) {
        const code = err?.data?.error;
        if (code === "invalid_credentials") setAuthMessage("error", "Mot de passe incorrect.");
        else if (code === "weak_password") setAuthMessage("error", "Mot de passe trop court (min 6).");
        else setAuthMessage("error", "Impossible de se connecter.");
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

  const init = async () => {
    initHamburgerMenu();
    initClientAuth();
    initForm();
    initQuickReserveFromServices();
    initMyBookings();
    await renderClientState();
  };

  init().catch(() => {});
})();
