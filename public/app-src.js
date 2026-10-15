import { getUser, handleAuthCallback, login, logout, onAuthChange, signup } from "@netlify/identity";

const toast = (message, kind = "success") => {
  const item = document.createElement("div");
  item.className = `toast toast-${kind}`;
  item.textContent = message;
  document.querySelector("#toast-region").append(item);
  window.setTimeout(() => item.remove(), 4500);
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function displayError(error) {
  toast(error instanceof Error ? error.message : "Something went wrong. Please try again.", "error");
}

async function api(action, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api?action=${encodeURIComponent(action)}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function setProfilePhoto(photoUrl) {
  const preview = document.querySelector("#profile-photo-preview");
  preview.replaceChildren();
  if (photoUrl) {
    const image = document.createElement("img");
    image.src = photoUrl;
    image.alt = "Profile picture preview";
    preview.append(image);
    document.querySelector("#remove-profile-photo").classList.remove("is-hidden");
  } else {
    const placeholder = document.createElement("span");
    placeholder.textContent = "⌁";
    preview.append(placeholder);
    document.querySelector("#remove-profile-photo").classList.add("is-hidden");
  }
}

function setProfileLink(slug, published) {
  const url = new URL(`/?u=${encodeURIComponent(slug)}`, location.origin).href;
  document.querySelector("#profile-url-prefix").textContent = `${location.origin}/?u=`;
  document.querySelector("#profile-link-preview").textContent = url;
  const preview = document.querySelector("#preview-profile");
  preview.href = url;
  preview.classList.toggle("is-hidden", !published);
  document.querySelector("#copy-profile-link").disabled = !published;
}

async function loadProfileSettings() {
  const { profile } = await api("profile_settings");
  document.querySelector("#profile-name").value = profile.name;
  document.querySelector("#profile-slug").value = profile.slug;
  document.querySelector("#profile-type").value = profile.profile_type;
  document.querySelector("#profile-headline").value = profile.headline;
  document.querySelector("#profile-company").value = profile.company;
  document.querySelector("#profile-bio").value = profile.bio;
  document.querySelector("#profile-phone").value = profile.phone;
  document.querySelector("#profile-email").value = profile.public_email;
  document.querySelector("#profile-website").value = profile.website;
  document.querySelector("#profile-location").value = profile.location;
  document.querySelector("#profile-published").checked = profile.is_published;
  document.querySelectorAll(".social-input").forEach((input) => {
    input.value = profile.social_links?.[input.dataset.network] ?? "";
  });
  setProfilePhoto(profile.photo_url);
  setProfileLink(profile.slug, profile.is_published);
  return profile;
}

function activateView(viewName) {
  const target = document.querySelector(`#view-${CSS.escape(viewName)}`);
  if (!target) return;
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("is-visible", view === target));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === viewName));
  if (viewName === "admin") loadAdmin().catch(displayError);
}

function socialButtons(profile) {
  const labels = {
    instagram: ["Instagram", "◎"], facebook: ["Facebook", "f"], tiktok: ["TikTok", "♪"],
    linkedin: ["LinkedIn", "in"], x: ["X", "𝕏"], youtube: ["YouTube", "▶"],
    whatsapp: ["WhatsApp", "◔"], telegram: ["Telegram", "➤"],
  };
  const links = Object.entries(labels).flatMap(([network, [label, icon]]) => {
    const href = profile.social_links?.[network];
    return typeof href === "string" && isHttpsUrl(href)
      ? [{ label, href, icon }]
      : [];
  });
  if (profile.website && isHttpsUrl(profile.website)) links.push({ label: "Website", href: profile.website, icon: "🌐" });
  if (profile.location) {
    links.push({ label: `Find us · ${profile.location}`, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.location)}`, icon: "⌖" });
  }
  if (profile.phone) links.push({ label: `Call ${profile.phone}`, href: `tel:${profile.phone.replace(/[^\d+*#]/g, "")}`, icon: "☎" });
  if (profile.public_email) links.push({ label: "Email us", href: `mailto:${profile.public_email}`, icon: "✉" });
  return links;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function escapeVcard(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

function downloadVcard(profile) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcard(profile.name)}`];
  if (profile.company) lines.push(`ORG:${escapeVcard(profile.company)}`);
  if (profile.headline) lines.push(`TITLE:${escapeVcard(profile.headline)}`);
  if (profile.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(profile.phone)}`);
  if (profile.public_email) lines.push(`EMAIL:${escapeVcard(profile.public_email)}`);
  if (profile.website) lines.push(`URL:${profile.website}`);
  if (profile.location) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(profile.location)};;;;`, `NOTE:${escapeVcard(`Location: ${profile.location}`)}`);
  lines.push("END:VCARD");
  const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/vcard;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${profile.slug}.vcf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function showPublicProfile(slug) {
  document.querySelector("#site-shell").classList.add("is-hidden");
  const container = document.querySelector("#public-profile");
  container.classList.remove("is-hidden");
  document.body.classList.add("public-profile-page");
  container.textContent = "Loading profile…";
  const { profile } = await api(`public_profile&u=${encodeURIComponent(slug)}`);
  const description = profile.headline || profile.company || `Connect with ${profile.name}`;
  const links = socialButtons(profile);
  container.innerHTML = `
    <div class="public-profile-topbar"><a class="brand profile-brand" href="/"><span class="brand-mark">⌁</span><span>taplink<span class="brand-light">.</span></span></a><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode">◐</button></div>
    ${profile.photo_url ? `<img class="public-profile-avatar" src="${escapeHtml(profile.photo_url)}" alt="${escapeHtml(profile.name)} profile picture">` : `<div class="public-profile-avatar">${escapeHtml(Array.from(profile.name)[0] || "T")}</div>`}
    ${profile.profile_type === "business" ? '<span class="public-profile-type">BUSINESS</span>' : ""}
    <h1 class="public-profile-name">${escapeHtml(profile.name)}</h1>
    ${profile.headline ? `<p class="public-profile-headline">${escapeHtml(profile.headline)}</p>` : ""}
    ${profile.company ? `<p class="public-profile-company">${escapeHtml(profile.company)}</p>` : ""}
    ${profile.bio ? `<p class="public-profile-bio">${escapeHtml(profile.bio).replace(/\r\n|\r|\n/g, "<br>")}</p>` : ""}
    <div class="linktree-buttons">${links.length
      ? links.map((item) => `<a class="linktree-button" href="${escapeHtml(item.href)}"${item.href.startsWith("https://") ? ' target="_blank" rel="noopener noreferrer"' : ""}><span class="linktree-button-icon">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span><span class="linktree-button-arrow">↗</span></a>`).join("")
      : '<p class="public-profile-empty-links">This page has no public links yet.</p>'}</div>
    <div class="public-profile-actions"><button class="button button-primary button-wide" id="download-contact">Save contact <span>↓</span></button><button class="button button-secondary button-wide" id="share-profile" type="button">Share profile <span>↗</span></button></div>
    <footer class="public-profile-footer">A little more connected. <a href="/">Create your TapLink</a></footer>
  `;
  container.querySelector("#download-contact").addEventListener("click", () => downloadVcard(profile));
  container.querySelector("#share-profile").addEventListener("click", async () => {
    const shareData = { title: `${profile.name} · TapLink`, url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(location.href);
        toast("Profile link copied.");
      }
    } catch (error) {
      if (error.name !== "AbortError") displayError(error);
    }
  });
  container.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      try {
        localStorage.setItem("taplink-theme", nextTheme);
      } catch {
        button.title = "Theme changed for this page only";
      }
    });
  });
  document.title = `${profile.name} · TapLink`;
  document.querySelector('meta[name="description"]').content = description;
}

function setupAuth() {
  const dialog = document.querySelector("#auth-dialog");
  let mode = "register";
  const setMode = (nextMode) => {
    mode = nextMode;
    const registering = mode === "register";
    document.querySelector("#auth-title").textContent = registering ? "Create your account" : "Welcome back";
    document.querySelector("#auth-submit").textContent = registering ? "Create account" : "Log in";
    document.querySelector("#register-name-row").classList.toggle("is-hidden", !registering);
    document.querySelector("#auth-name").required = registering;
    document.querySelector("#auth-password").autocomplete = registering ? "new-password" : "current-password";
    document.querySelector("#auth-password").minLength = registering ? 10 : 1;
    document.querySelector("#password-hint").classList.toggle("is-hidden", !registering);
    document.querySelector("#auth-switch-copy").textContent = registering ? "Already have an account?" : "New to TapLink?";
    document.querySelector("#auth-switch-button").textContent = registering ? "Log in" : "Create an account";
  };
  document.querySelectorAll("[data-open-auth]").forEach((button) => button.addEventListener("click", () => {
    setMode(button.dataset.openAuth);
    dialog.showModal();
  }));
  document.querySelector("#auth-switch-button").addEventListener("click", () => setMode(mode === "register" ? "login" : "register"));
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#auth-submit");
    button.disabled = true;
    try {
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      if (mode === "register") {
        await signup(email, password, { full_name: document.querySelector("#auth-name").value.trim() });
        const currentUser = await getUser();
        if (!currentUser) {
          dialog.close();
          toast("Check your email to confirm your account, then sign in.");
          return;
        }
        dialog.close();
        await updateSession(currentUser);
        return;
      }
      await login(email, password);
      const currentUser = await getUser();
      if (!currentUser) {
        dialog.close();
        toast("Your sign-in is not active. Please try again.");
        return;
      }
      dialog.close();
      await updateSession(currentUser);
    } catch (error) {
      displayError(error);
    } finally {
      button.disabled = false;
    }
  });
}

async function updateSession(session) {
  const landing = document.querySelector("#landing-view");
  const workspace = document.querySelector("#workspace-view");
  document.querySelector("#guest-actions").classList.toggle("is-hidden", Boolean(session));
  document.querySelector("#public-header").classList.toggle("is-hidden", Boolean(session));
  landing.classList.toggle("is-hidden", Boolean(session));
  workspace.classList.toggle("is-hidden", !session);
  if (!session) return;
  const name = session.userMetadata?.full_name || session.email || "TapLink user";
  document.querySelector("#header-name").textContent = name;
  document.querySelector("#user-avatar").textContent = Array.from(name)[0]?.toUpperCase() || "T";
  const profile = await loadProfileSettings();
  const isAdmin = profile.role === "admin";
  document.querySelector("#admin-nav").classList.toggle("is-hidden", !isAdmin);
  const profileName = document.querySelector("#profile-name").value || name;
  document.querySelector("#header-name").textContent = profileName;
  document.querySelector("#user-avatar").textContent = Array.from(profileName)[0]?.toUpperCase() || "T";
  activateView(location.hash === "#admin" && isAdmin ? "admin" : "profile");
}

async function loadAdmin() {
  const result = await api("admin");
  document.querySelector('[data-admin-stat="users"]').textContent = result.stats.users;
  document.querySelector("#app-name").value = result.appName;
  document.querySelector("#admin-user-rows").innerHTML = result.users.map((user) => `
    <tr><td><b>${escapeHtml(user.name)}</b></td><td>${escapeHtml(user.email)}</td><td>
      <select class="field admin-role" data-id="${escapeHtml(user.id)}" aria-label="Role for ${escapeHtml(user.name)}"><option value="user" ${user.role === "user" ? "selected" : ""}>User</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option></select></td>
      <td>${escapeHtml(new Intl.DateTimeFormat().format(new Date(user.created_at)))}</td><td><span class="status-badge ${user.is_active ? "status-active" : "status-disabled"}">${user.is_active ? "Active" : "Disabled"}</span></td>
      <td><button class="button button-small ${user.is_active ? "button-secondary" : "button-primary"} toggle-user" data-id="${escapeHtml(user.id)}" data-active="${user.is_active ? "true" : "false"}">${user.is_active ? "Disable" : "Enable"}</button></td></tr>`).join("");
}

function setupWorkspace() {
  document.querySelectorAll("[data-view]").forEach((link) => link.addEventListener("click", () => {
    activateView(link.dataset.view);
    location.hash = link.dataset.view;
  }));
  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await logout();
    } catch (error) {
      return displayError(error);
    }
    location.reload();
  });
  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      name: document.querySelector("#profile-name").value,
      slug: document.querySelector("#profile-slug").value,
      profile_type: document.querySelector("#profile-type").value,
      headline: document.querySelector("#profile-headline").value,
      company: document.querySelector("#profile-company").value,
      bio: document.querySelector("#profile-bio").value,
      phone: document.querySelector("#profile-phone").value,
      public_email: document.querySelector("#profile-email").value,
      website: document.querySelector("#profile-website").value,
      location: document.querySelector("#profile-location").value,
      social_links: Object.fromEntries(Array.from(document.querySelectorAll(".social-input")).map((input) => [input.dataset.network, input.value])),
      is_published: document.querySelector("#profile-published").checked,
    };
    try {
      const result = await api("profile_save", { method: "POST", body });
      document.querySelector("#header-name").textContent = result.name;
      document.querySelector("#user-avatar").textContent = Array.from(result.name)[0]?.toUpperCase() || "T";
      setProfileLink(result.slug, body.is_published);
      toast("Link page saved.");
    } catch (error) {
      displayError(error);
    }
  });
  document.querySelector("#profile-photo-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.querySelector("#profile-photo-status");
    const uploadButton = document.querySelector('label[for="profile-photo-file"]');
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      toast("Choose a JPG, PNG, or WebP photo smaller than 5 MB.", "error");
      return;
    }
    const form = new FormData();
    form.append("photo", file);
    uploadButton.setAttribute("aria-disabled", "true");
    status.textContent = "Uploading…";
    try {
      const result = await api("profile_photo_upload", { method: "POST", body: form });
      setProfilePhoto(result.photo_url);
      status.textContent = "Photo uploaded.";
      toast("Profile photo uploaded.");
    } catch (error) {
      status.textContent = "";
      displayError(error);
    } finally {
      uploadButton.removeAttribute("aria-disabled");
      event.target.value = "";
    }
  });
  document.querySelector("#remove-profile-photo").addEventListener("click", async () => {
    try {
      await api("profile_photo_delete", { method: "POST", body: {} });
      setProfilePhoto(null);
      document.querySelector("#profile-photo-status").textContent = "Photo removed.";
      toast("Profile photo removed.");
    } catch (error) {
      displayError(error);
    }
  });
  document.querySelector("#copy-profile-link").addEventListener("click", async () => {
    const url = document.querySelector("#profile-link-preview").textContent;
    try {
      await navigator.clipboard.writeText(url);
      toast("Your profile link has been copied.");
    } catch {
      window.prompt("Copy your profile link:", url);
    }
  });
  document.querySelector("#admin-user-rows").addEventListener("change", async (event) => {
    if (!event.target.matches(".admin-role")) return;
    const row = event.target.closest("tr");
    try {
      await api("admin_user_update", { method: "POST", body: { id: event.target.dataset.id, role: event.target.value, active: row.querySelector(".toggle-user").dataset.active === "true" } });
      toast("User role updated.");
      await loadAdmin();
    } catch (error) {
      displayError(error);
      await loadAdmin().catch(displayError);
    }
  });
  document.querySelector("#admin-user-rows").addEventListener("click", async (event) => {
    const button = event.target.closest(".toggle-user");
    if (!button) return;
    try {
      await api("admin_user_update", { method: "POST", body: { id: button.dataset.id, role: button.closest("tr").querySelector(".admin-role").value, active: button.dataset.active !== "true" } });
      toast("Account status updated.");
      await loadAdmin();
    } catch (error) {
      displayError(error);
    }
  });
  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("admin_settings", { method: "POST", body: { app_name: document.querySelector("#app-name").value } });
      toast("Application name saved.");
    } catch (error) {
      displayError(error);
    }
  });
}

document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelector("#year").textContent = new Date().getFullYear();
setupAuth();
setupWorkspace();

const profileSlug = new URLSearchParams(location.search).get("u");
if (profileSlug) {
  try {
    await showPublicProfile(profileSlug);
  } catch (error) {
    document.querySelector("#public-profile").textContent = error.message || "Profile not found.";
    document.querySelector("#public-profile").classList.remove("is-hidden");
    document.querySelector("#site-shell").classList.add("is-hidden");
  }
} else {
  try {
    await handleAuthCallback();
    await updateSession(await getUser());
    onAuthChange((_event, user) => {
      window.setTimeout(() => updateSession(user).catch(displayError), 0);
    });
  } catch (error) {
    displayError(error);
  }
}
