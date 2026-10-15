const socialHosts = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  whatsapp: ["wa.me", "whatsapp.com"],
  telegram: ["t.me", "telegram.me", "telegram.org"],
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(payload),
  };
}

function configuration() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new ApiError(503, "Supabase is not configured. Set the required Netlify environment variables.");
  }
  return { url, anonKey, serviceKey };
}

async function supabase(path, { method = "GET", body, headers = {}, serviceKey } = {}) {
  const { url, serviceKey: serviceRoleKey } = configuration();
  const key = serviceKey ?? serviceRoleKey;
  const result = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await result.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(502, "Supabase returned an invalid response.");
    }
  }
  if (!result.ok) {
    if (result.status === 409 || payload?.code === "23505") {
      throw new ApiError(409, "That profile URL is already taken. Choose another one.");
    }
    console.error("Supabase request failed:", { path, status: result.status, code: payload?.code });
    throw new ApiError(502, "The database request failed. Check the Supabase configuration and try again.");
  }
  return payload;
}

function encodeFilter(value) {
  return encodeURIComponent(value);
}

async function requestData(event) {
  if (!event.body) return {};
  const contentType = event.headers?.["content-type"] ?? event.headers?.["Content-Type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    const body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
    const request = new Request(event.rawUrl ?? "https://taplink.invalid/api", {
      method: event.httpMethod,
      headers: { "content-type": contentType },
      body,
    });
    return request.formData();
  }
  try {
    const value = JSON.parse(event.body);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "Invalid request body.");
    }
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON request body.");
  }
}

async function authenticatedUser(event) {
  const authorization = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, "Please sign in to continue.");
  const { url, anonKey } = configuration();
  const result = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!result.ok) throw new ApiError(401, "Your session expired. Please sign in again.");
  const user = await result.json();
  if (isBanned(user)) throw new ApiError(401, "This account is no longer active. Please contact an administrator.");
  return { user, token };
}

function isBanned(user) {
  if (!user?.banned_until) return false;
  const bannedUntil = Date.parse(user.banned_until);
  return Number.isFinite(bannedUntil) && bannedUntil > Date.now();
}

async function profileForUser(userId) {
  const rows = await supabase(`/rest/v1/profiles?select=*&user_id=eq.${encodeFilter(userId)}&limit=1`);
  if (!rows?.[0]) throw new ApiError(404, "Profile not found.");
  return rows[0];
}

async function signedPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const result = await supabase("/storage/v1/object/sign/profile-photos/" + photoPath.split("/").map(encodeURIComponent).join("/"), {
    method: "POST",
    body: { expiresIn: 3600 },
  });
  const signedUrl = result?.signedURL ?? result?.signedUrl;
  if (!signedUrl) throw new ApiError(502, "Could not create a profile photo link.");
  return signedUrl.startsWith("http") ? signedUrl : `${configuration().url}/storage/v1${signedUrl}`;
}

function requiredText(value, label, limit) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit) {
    throw new ApiError(422, `${label} must be between 1 and ${limit} characters.`);
  }
  return value.trim();
}

function optionalText(value, label, limit) {
  if (typeof value !== "string" || value.trim().length > limit) {
    throw new ApiError(422, `${label} must be no more than ${limit} characters.`);
  }
  return value.trim();
}

function validatedProfile(data) {
  const name = requiredText(data.name, "Name", 120);
  const slug = typeof data.slug === "string" ? data.slug.trim().toLowerCase() : "";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
    throw new ApiError(422, "Your profile URL must be 3–40 characters using lowercase letters, numbers, and hyphens.");
  }
  const profileType = data.profile_type ?? "personal";
  if (!["personal", "business"].includes(profileType)) {
    throw new ApiError(422, "Choose personal or business profile type.");
  }
  const headline = optionalText(data.headline ?? "", "Headline", 120);
  const company = optionalText(data.company ?? "", "Company", 120);
  const bio = optionalText(data.bio ?? "", "About you", 600);
  const phone = optionalText(data.phone ?? "", "Phone", 40);
  const location = optionalText(data.location ?? "", "Location", 300);
  const publicEmail = optionalText(data.public_email ?? "", "Public email", 254).toLowerCase();
  if (publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) {
    throw new ApiError(422, "Enter a valid public contact email address.");
  }
  const website = optionalText(data.website ?? "", "Website", 500);
  if (website && (!isHttpsUrl(website) || !validUrl(website))) {
    throw new ApiError(422, "Enter a valid website URL beginning with https://.");
  }
  if (!data.social_links || typeof data.social_links !== "object" || Array.isArray(data.social_links)) {
    throw new ApiError(422, "Invalid social links.");
  }
  const socialLinks = {};
  for (const [network, hosts] of Object.entries(socialHosts)) {
    const link = optionalText(data.social_links[network] ?? "", `${network} link`, 500);
    if (!link) continue;
    let parsed;
    try {
      parsed = new URL(link);
    } catch {
      throw new ApiError(422, `Enter a valid HTTPS ${network} profile link.`);
    }
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      throw new ApiError(422, `Enter a valid HTTPS ${network} profile link.`);
    }
    socialLinks[network] = link;
  }
  return {
    name,
    slug,
    profile_type: profileType,
    headline,
    company,
    bio,
    phone,
    public_email: publicEmail,
    website,
    location,
    social_links: socialLinks,
    is_published: data.is_published === true,
  };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function imageDimensions(bytes, mimeType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === "image/png" && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += segmentLength;
    }
    return null;
  }
  if (mimeType === "image/webp" && bytes.length >= 25) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
      };
    }
  }
  return null;
}

async function requireAdmin(user) {
  if (user.app_metadata?.role !== "admin") {
    throw new ApiError(403, "Administrator access is required.");
  }
}

async function allAuthUsers() {
  const users = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await supabase(`/auth/v1/admin/users?page=${page}&per_page=100`);
    users.push(...(result.users ?? []));
    if (!result.users || result.users.length < 100) break;
  }
  return users;
}

async function handle(event) {
  const method = event.httpMethod;
  const action = event.queryStringParameters?.action;
  if (method === "GET" && action === "config") {
    const { url, anonKey } = configuration();
    return response(200, { supabaseUrl: url, supabaseAnonKey: anonKey });
  }
  if (!["GET", "POST"].includes(method)) throw new ApiError(405, "Method not allowed.");

  if (method === "GET" && action === "public_profile") {
    const slug = event.queryStringParameters?.u ?? "";
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
      throw new ApiError(404, "Profile not found.");
    }
    const rows = await supabase(`/rest/v1/profiles?select=user_id,name,slug,profile_type,headline,company,bio,phone,public_email,website,location,social_links,photo_path&slug=eq.${encodeFilter(slug)}&is_published=eq.true&limit=1`);
    if (!rows?.[0]) throw new ApiError(404, "Profile not found or not published.");
    const profile = rows[0];
    const account = await supabase(`/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`);
    if (isBanned(account)) throw new ApiError(404, "Profile not found or not published.");
    return response(200, { profile: { ...profile, photo_url: await signedPhotoUrl(profile.photo_path), photo_path: undefined } });
  }

  const { user } = await authenticatedUser(event);
  if (method === "GET" && action === "profile_settings") {
    const profile = await profileForUser(user.id);
    return response(200, {
      profile: {
        ...profile,
        photo_url: await signedPhotoUrl(profile.photo_path),
        photo_path: undefined,
        name: profile.name || user.user_metadata?.name || "",
      },
    });
  }

  if (method === "POST") {
    const data = await requestData(event);
    if (action === "profile_save") {
      const profile = validatedProfile(data);
      const updated = await supabase(`/rest/v1/profiles?user_id=eq.${encodeFilter(user.id)}`, {
        method: "PATCH",
        body: { ...profile, updated_at: new Date().toISOString() },
        headers: { Prefer: "return=representation" },
      });
      await supabase(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PUT",
        body: { user_metadata: { ...user.user_metadata, name: profile.name } },
      });
      return response(200, { ok: true, slug: updated?.[0]?.slug ?? profile.slug, name: profile.name });
    }
    if (action === "profile_photo_upload") {
      if (!(data instanceof FormData)) throw new ApiError(422, "Choose a profile photo to upload.");
      const photo = data.get("photo");
      if (!(photo instanceof File) || photo.size < 1 || photo.size > 5 * 1024 * 1024) {
        throw new ApiError(422, "Profile photos must be smaller than 5 MB.");
      }
      const allowed = {
        "image/jpeg": { ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
        "image/png": { ext: "png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
        "image/webp": { ext: "webp", matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
      };
      const imageType = allowed[photo.type];
      const bytes = new Uint8Array(await photo.arrayBuffer());
      if (!imageType || !imageType.matches(bytes)) {
        throw new ApiError(422, "Choose a valid JPG, PNG, or WebP photo.");
      }
      const dimensions = imageDimensions(bytes, photo.type);
      if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 6000 || dimensions.height > 6000 || dimensions.width * dimensions.height > 24000000) {
        throw new ApiError(422, "Choose an image with dimensions under 6000 × 6000 pixels.");
      }
      const profile = await profileForUser(user.id);
      const path = `${user.id}/${crypto.randomUUID()}.${imageType.ext}`;
      const { url, serviceKey } = configuration();
      const upload = await fetch(`${url}/storage/v1/object/profile-photos/${path}`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": photo.type,
          "x-upsert": "false",
        },
        body: bytes,
      });
      if (!upload.ok) throw new ApiError(502, "The profile photo could not be stored.");
      try {
        await supabase(`/rest/v1/profiles?user_id=eq.${encodeFilter(user.id)}`, {
          method: "PATCH",
          body: { photo_path: path, updated_at: new Date().toISOString() },
        });
      } catch (error) {
        await fetch(`${url}/storage/v1/object/profile-photos/${path}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        throw error;
      }
      if (profile.photo_path) {
        try {
          await supabase("/storage/v1/object/profile-photos", {
            method: "DELETE",
            body: { prefixes: [profile.photo_path] },
          });
        } catch (error) {
          console.error("TapLink could not remove the previous profile photo:", error);
        }
      }
      return response(200, { ok: true, photo_url: await signedPhotoUrl(path) });
    }
    if (action === "profile_photo_delete") {
      const profile = await profileForUser(user.id);
      await supabase(`/rest/v1/profiles?user_id=eq.${encodeFilter(user.id)}`, {
        method: "PATCH",
        body: { photo_path: null, updated_at: new Date().toISOString() },
      });
      if (profile.photo_path) {
        await supabase("/storage/v1/object/profile-photos", {
          method: "DELETE",
          body: { prefixes: [profile.photo_path] },
        });
      }
      return response(200, { ok: true });
    }
    if (action === "admin_user_update") {
      await requireAdmin(user);
      if (typeof data.id !== "string" || !["user", "admin"].includes(data.role) || typeof data.active !== "boolean") {
        throw new ApiError(422, "Invalid user update.");
      }
      if (data.id === user.id && (data.role !== "admin" || !data.active)) {
        throw new ApiError(422, "You cannot remove your own administrator access.");
      }
      const users = await allAuthUsers();
      const target = users.find((account) => account.id === data.id);
      if (!target) throw new ApiError(404, "User not found.");
      const activeAdmins = users.filter((account) => account.app_metadata?.role === "admin" && !isBanned(account)).length;
      if (target.app_metadata?.role === "admin" && !isBanned(target) && (data.role !== "admin" || !data.active) && activeAdmins <= 1) {
        throw new ApiError(422, "The last active administrator cannot be disabled or demoted.");
      }
      await supabase(`/auth/v1/admin/users/${encodeURIComponent(data.id)}`, {
        method: "PUT",
        body: {
          app_metadata: { ...target.app_metadata, role: data.role },
          ban_duration: data.active ? "none" : "876000h",
        },
      });
      return response(200, { ok: true });
    }
    if (action === "admin_settings") {
      await requireAdmin(user);
      const appName = requiredText(data.app_name, "Application name", 80);
      await supabase("/rest/v1/app_settings?on_conflict=setting_key", {
        method: "POST",
        body: { setting_key: "app_name", setting_value: appName, updated_at: new Date().toISOString() },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });
      return response(200, { ok: true });
    }
  }

  if (method === "GET" && action === "admin") {
    await requireAdmin(user);
    const users = await allAuthUsers();
    const profiles = await supabase("/rest/v1/profiles?select=user_id,name,slug");
    const profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const appNames = await supabase("/rest/v1/app_settings?select=setting_value&setting_key=eq.app_name&limit=1");
    return response(200, {
      stats: { users: users.length },
      users: users.map((account) => ({
        id: account.id,
        name: profileByUserId.get(account.id)?.name || account.user_metadata?.name || "",
        email: account.email ?? "",
        role: account.app_metadata?.role === "admin" ? "admin" : "user",
        is_active: isBanned(account) ? 0 : 1,
        created_at: account.created_at,
      })).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      appName: appNames?.[0]?.setting_value || "TapLink",
    });
  }
  throw new ApiError(404, "Not found.");
}

export const handler = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    if (error instanceof ApiError) return response(error.status, { error: error.message });
    console.error("TapLink API request failed:", error);
    return response(500, { error: "The request could not be completed. Check the Supabase and Netlify configuration." });
  }
};
