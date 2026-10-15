import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

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

async function api(action, { method = "GET", body, params = {} } = {}) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`/api?${query}`, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
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
  const { profile } = await api("public_profile", { params: { u: slug } });
  const description = profile.headline || profile.company || `Connect with ${profile.name}`;
  const links = socialButtons(profile);
  const template = ["studio", "noir", "editorial", "orbit", "garden", "card"].includes(profile.template) ? profile.template : "studio";
  container.className = `public-profile-card template-${template}`;
  document.body.dataset.profileTemplate = template;
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
    <footer class="public-profile-footer">A little more connected. <a href="/">Powered by TapLink</a></footer>
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
  const authError = document.querySelector("#auth-error");
  const submitButton = document.querySelector("#auth-submit");
  const submitLabel = document.querySelector("#auth-submit-label");
  const spinner = document.querySelector("#auth-spinner");
  const passwordInput = document.querySelector("#auth-password");
  const passwordToggle = document.querySelector("#toggle-password");
  const clearAuthError = () => {
    authError.textContent = "";
    authError.classList.add("is-hidden");
    document.querySelectorAll("#auth-email, #auth-password").forEach((input) => {
      input.removeAttribute("aria-invalid");
    });
  };
  passwordToggle.addEventListener("click", () => {
    const showingPassword = passwordInput.type === "password";
    passwordInput.type = showingPassword ? "text" : "password";
    passwordToggle.textContent = showingPassword ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-pressed", String(showingPassword));
    passwordToggle.setAttribute("aria-label", `${showingPassword ? "Hide" : "Show"} password`);
    passwordInput.focus();
  });
  const setSubmitting = (submitting) => {
    submitButton.disabled = submitting;
    submitButton.setAttribute("aria-busy", String(submitting));
    spinner.classList.toggle("is-hidden", !submitting);
    submitLabel.textContent = submitting ? "Signing in…" : "Sign in";
  };
  document.querySelectorAll("[data-open-auth]").forEach((button) => button.addEventListener("click", () => {
    clearAuthError();
    dialog.showModal();
  }));
  document.querySelectorAll("#auth-email, #auth-password").forEach((input) => {
    input.addEventListener("input", clearAuthError);
  });
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthError();
    setSubmitting(true);
    try {
      if (location.protocol === "file:") {
        throw new Error("Sign-in requires the deployed Netlify site or `netlify dev`; opening this file directly cannot reach Netlify Identity.");
      }
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      const currentUser = await login(email, password);
      await updateSession(currentUser);
      dialog.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      authError.textContent = error?.status === 404 || /\b404\b/.test(message)
        ? "Netlify Identity is not enabled for this site (the Identity endpoint returned 404). In Netlify, open Site configuration → Identity and enable Identity, then reload this page. This cannot be fixed by changing the login form."
        : message;
      authError.classList.remove("is-hidden");
      const invalidInput = error?.status === 400 || error?.status === 422;
      if (invalidInput) {
        passwordInput.setAttribute("aria-invalid", "true");
      }
      authError.focus();
      authError.scrollIntoView({ block: "nearest" });
    } finally {
      setSubmitting(false);
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
  try {
    await api("admin");
  } catch (error) {
    landing.classList.remove("is-hidden");
    workspace.classList.add("is-hidden");
    await logout();
    if (error.status === 403) {
      throw new Error("This account is not an administrator. Ask the site owner to grant admin access.");
    }
    throw error;
  }
  const name = session.name || session.email || "TapLink admin";
  document.querySelector("#header-name").textContent = name;
  document.querySelector("#user-avatar").textContent = Array.from(name)[0]?.toUpperCase() || "T";
  activateView("admin");
}

async function loadAdmin() {
  const { pages } = await api("customer_pages");
  const container = document.querySelector("#customer-page-list");
  document.querySelector("#customer-count").textContent = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
  if (!pages.length) {
    container.innerHTML = '<p class="customer-empty">No customer pages yet. Create one to get started.</p>';
    return;
  }
  container.innerHTML = pages.map((page) => {
    const url = new URL(`/?u=${encodeURIComponent(page.slug)}`, location.origin).href;
    return `<article class="customer-page-row">
      <div class="customer-page-info"><span class="template-swatch template-swatch-${escapeHtml(page.template)}"></span>
        <div><h3>${escapeHtml(page.name)}</h3><p>${escapeHtml(page.slug)} · ${escapeHtml(page.template)} · <span class="${page.is_published ? "customer-published" : "customer-draft"}">${page.is_published ? "Published" : "Draft"}</span></p></div>
      </div>
      <div class="customer-page-actions">
        ${page.is_published ? `<button class="button button-secondary button-small" type="button" data-customer-action="copy" data-url="${escapeHtml(url)}">Copy link</button><a class="button button-secondary button-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Preview ↗</a>` : ""}
        <button class="button button-secondary button-small" type="button" data-customer-action="edit" data-id="${escapeHtml(page.id)}">Edit</button>
        <button class="button button-quiet button-small" type="button" data-customer-action="delete" data-id="${escapeHtml(page.id)}" data-name="${escapeHtml(page.name)}">Delete</button>
      </div>
    </article>`;
  }).join("");
  container.customerPages = pages;
}

function setupWorkspace() {
  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await logout();
    } catch (error) {
      return displayError(error);
    }
    location.reload();
  });
  const form = document.querySelector("#customer-form");
  const editor = document.querySelector("#customer-editor-panel");
  const clearForm = () => {
    form.reset();
    document.querySelector("#customer-id").value = "";
    document.querySelector("#customer-url-prefix").textContent = `${location.origin}/?u=`;
    document.querySelector("#customer-template").value = "studio";
    document.querySelector("#customer-form-title").textContent = "Create a page";
    document.querySelector("#save-customer-page").textContent = "Save customer page";
  };
  const editPage = (page) => {
    document.querySelector("#customer-id").value = page.id;
    document.querySelector("#customer-name").value = page.name;
    document.querySelector("#customer-slug").value = page.slug;
    document.querySelector("#customer-type").value = page.profile_type;
    document.querySelector("#customer-template").value = page.template;
    document.querySelector("#customer-headline").value = page.headline;
    document.querySelector("#customer-company").value = page.company;
    document.querySelector("#customer-phone").value = page.phone;
    document.querySelector("#customer-email").value = page.public_email;
    document.querySelector("#customer-photo").value = page.photo_url;
    document.querySelector("#customer-website").value = page.website;
    document.querySelector("#customer-location").value = page.location;
    document.querySelector("#customer-bio").value = page.bio;
    document.querySelector("#customer-published").checked = page.is_published;
    document.querySelectorAll(".customer-social-input").forEach((input) => {
      input.value = page.social_links?.[input.dataset.network] ?? "";
    });
    document.querySelector("#customer-form-title").textContent = `Edit ${page.name}`;
    document.querySelector("#save-customer-page").textContent = "Save changes";
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.querySelector("#customer-url-prefix").textContent = `${location.origin}/?u=`;
  document.querySelector("#new-customer-page").addEventListener("click", () => {
    clearForm();
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector("#customer-name").focus();
  });
  document.querySelector("#cancel-customer-edit").addEventListener("click", clearForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#save-customer-page");
    button.disabled = true;
    try {
      const body = {
        id: document.querySelector("#customer-id").value || undefined,
        name: document.querySelector("#customer-name").value,
        slug: document.querySelector("#customer-slug").value,
        profile_type: document.querySelector("#customer-type").value,
        template: document.querySelector("#customer-template").value,
        headline: document.querySelector("#customer-headline").value,
        company: document.querySelector("#customer-company").value,
        phone: document.querySelector("#customer-phone").value,
        public_email: document.querySelector("#customer-email").value,
        photo_url: document.querySelector("#customer-photo").value,
        website: document.querySelector("#customer-website").value,
        location: document.querySelector("#customer-location").value,
        bio: document.querySelector("#customer-bio").value,
        social_links: Object.fromEntries(Array.from(document.querySelectorAll(".customer-social-input")).map((input) => [input.dataset.network, input.value])),
        is_published: document.querySelector("#customer-published").checked,
      };
      const result = await api("customer_page_save", { method: "POST", body });
      clearForm();
      await loadAdmin();
      toast(`Page saved for ${result.name}.`);
    } catch (error) {
      displayError(error);
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector("#customer-page-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-customer-action]");
    if (!button) return;
    if (button.dataset.customerAction === "copy") {
      const url = button.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        toast("Customer link copied.");
      } catch {
        window.prompt("Copy the customer page link:", url);
      }
      return;
    }
    const page = document.querySelector("#customer-page-list").customerPages.find((item) => item.id === button.dataset.id);
    if (!page) return;
    if (button.dataset.customerAction === "edit") {
      editPage(page);
      return;
    }
    if (button.dataset.customerAction === "delete" && window.confirm(`Delete the page for ${page.name}? This cannot be undone.`)) {
      try {
        await api("customer_page_delete", { method: "POST", body: { id: page.id } });
        if (document.querySelector("#customer-id").value === page.id) clearForm();
        await loadAdmin();
        toast("Customer page deleted.");
      } catch (error) {
        displayError(error);
      }
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
