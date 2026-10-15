import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";

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
const pageTemplates = ["studio", "noir", "editorial", "orbit", "garden", "card"];
const bootstrapAdminEmail = process.env.TAPLINK_ADMIN_EMAIL?.trim().toLowerCase();

const db = getDatabase();
const photos = getStore("taplink-profile-photos");

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(status, data) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function slugFromName(name, userId) {
  const prefix = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 26) || "member";
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
  return `${prefix}-${suffix}`;
}

async function ensureProfile(user) {
  const defaultName = typeof user.userMetadata?.full_name === "string"
    ? user.userMetadata.full_name.trim().slice(0, 120)
    : "";
  const isBootstrapAdmin = Boolean(
    bootstrapAdminEmail
      && user.email
      && user.email.trim().toLowerCase() === bootstrapAdminEmail,
  );
  await db.sql`
    insert into profiles (user_id, email, name, slug, role)
    values (
      ${user.id}, ${user.email ?? ""}, ${defaultName},
      ${slugFromName(defaultName, user.id)},
      case when ${isBootstrapAdmin} then 'admin' else 'user' end
    )
    on conflict (user_id) do update
      set email = excluded.email,
          name = case when profiles.name = '' then excluded.name else profiles.name end,
          role = case when ${isBootstrapAdmin} then 'admin' else profiles.role end
  `;
  const rows = await db.sql`select * from profiles where user_id = ${user.id} limit 1`;
  const profile = rows[0];
  if (!profile) throw new ApiError(404, "Profile not found.");
  return profile;
}

async function authenticatedUser() {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  const profile = await ensureProfile(user);
  if (!profile.is_active) {
    throw new ApiError(401, "This account is no longer active. Please contact an administrator.");
  }
  return { user, profile };
}

async function requireAdmin(auth) {
  if (auth.profile.role !== "admin") {
    throw new ApiError(403, "Administrator access is required.");
  }
  return auth;
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

function validatedCustomerPage(data) {
  const profile = validatedProfile({ ...data, is_published: data.is_published === true });
  const template = data.template ?? "studio";
  if (!pageTemplates.includes(template)) {
    throw new ApiError(422, "Choose one of the available page designs.");
  }
  const photoUrl = optionalText(data.photo_url ?? "", "Photo URL", 1000);
  if (photoUrl && (!isHttpsUrl(photoUrl) || !validUrl(photoUrl))) {
    throw new ApiError(422, "Enter a valid photo URL beginning with https://.");
  }
  return { ...profile, template, photo_url: photoUrl };
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

async function publicProfile(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
    throw new ApiError(404, "Profile not found.");
  }
  const customerRows = await db.sql`
    select name, slug, profile_type, headline, company, bio, phone, public_email,
           website, location, social_links, photo_url, template, is_published
    from customer_pages
    where slug = ${slug} and is_published = true
    limit 1
  `;
  if (customerRows[0]) return customerRows[0];
  const rows = await db.sql`
    select name, slug, profile_type, headline, company, bio, phone, public_email,
           website, location, social_links, photo_path, is_published
    from profiles
    where slug = ${slug} and is_published = true and is_active = true
    limit 1
  `;
  if (!rows[0]) throw new ApiError(404, "Profile not found or not published.");
  return { ...rows[0], photo_url: null, template: "studio" };
}

function photoUrl(slug) {
  return `/api?action=profile_photo&u=${encodeURIComponent(slug)}`;
}

async function profileSettings(auth) {
  return {
    ...auth.profile,
    name: auth.profile.name || auth.user.userMetadata?.full_name || auth.user.email || "",
    photo_url: auth.profile.photo_path ? photoUrl(auth.profile.slug) : null,
    photo_path: undefined,
  };
}

async function serveProfilePhoto(request, context, slug) {
  const publicRows = await db.sql`
    select user_id, slug, photo_path
    from profiles
    where slug = ${slug} and is_published = true and is_active = true
    limit 1
  `;
  let profile = publicRows[0];
  if (!profile) {
    let auth;
    try {
      auth = await authenticatedUser();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        throw new ApiError(404, "Profile photo not found.");
      }
      throw error;
    }
    if (auth.profile.slug !== slug) throw new ApiError(404, "Profile photo not found.");
    profile = auth.profile;
  }
  if (!profile.photo_path) throw new ApiError(404, "Profile photo not found.");
  const image = await photos.get(profile.photo_path, { type: "blob" });
  if (!image) throw new ApiError(404, "Profile photo not found.");
  const extension = profile.photo_path.split(".").pop();
  const mimeType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension];
  if (!mimeType) throw new ApiError(404, "Profile photo not found.");
  return new Response(image, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

async function handle(request, context) {
  const url = new URL(request.url);
  const method = request.method;
  const action = url.searchParams.get("action") ?? "";

  if (method === "GET" && action === "public_profile") {
    const profile = await publicProfile(url.searchParams.get("u") ?? "");
    return json(200, { profile: { ...profile, photo_url: profile.photo_path ? photoUrl(profile.slug) : profile.photo_url, photo_path: undefined } });
  }
  if (method === "GET" && action === "profile_photo") {
    return serveProfilePhoto(request, context, url.searchParams.get("u") ?? "");
  }
  if (!["GET", "POST"].includes(method)) throw new ApiError(405, "Method not allowed.");

  const auth = await authenticatedUser();
  if (method === "GET" && action === "profile_settings") {
    await requireAdmin(auth);
    return json(200, { profile: await profileSettings(auth) });
  }
  if (method === "GET" && action === "admin") {
    await requireAdmin(auth);
    const pages = await db.sql`select count(*)::int as count from customer_pages`;
    return json(200, { customerPages: pages[0].count });
  }
  if (method === "GET" && action === "customer_pages") {
    await requireAdmin(auth);
    const pages = await db.sql`
      select id, name, slug, profile_type, headline, company, bio, phone,
             public_email, website, location, photo_url, social_links,
             template, is_published, created_at, updated_at
      from customer_pages
      order by updated_at desc
    `;
    return json(200, { pages });
  }

  if (method !== "POST") throw new ApiError(404, "Not found.");

  if (action === "customer_page_save") {
    await requireAdmin(auth);
    const data = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON request body.");
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(400, "Invalid request body.");
    const profile = validatedCustomerPage(data);
    const id = typeof data.id === "string" && data.id ? data.id : null;
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(422, "Invalid customer page identifier.");
    }
    const existingProfile = await db.sql`select user_id from profiles where slug = ${profile.slug} limit 1`;
    if (existingProfile[0]) {
      throw new ApiError(409, "That page address is already used by an existing profile.");
    }
    try {
      if (id) {
        const updated = await db.sql`
          update customer_pages set
            name = ${profile.name}, slug = ${profile.slug}, profile_type = ${profile.profile_type},
            headline = ${profile.headline}, company = ${profile.company}, bio = ${profile.bio},
            phone = ${profile.phone}, public_email = ${profile.public_email},
            website = ${profile.website}, location = ${profile.location}, photo_url = ${profile.photo_url},
            social_links = ${JSON.stringify(profile.social_links)}::jsonb, template = ${profile.template},
            is_published = ${profile.is_published}, updated_at = now()
          where id = ${id} returning id
        `;
        if (!updated[0]) throw new ApiError(404, "Customer page not found.");
      } else {
        await db.sql`
          insert into customer_pages (
            name, slug, profile_type, headline, company, bio, phone, public_email,
            website, location, photo_url, social_links, template, is_published
          ) values (
            ${profile.name}, ${profile.slug}, ${profile.profile_type}, ${profile.headline},
            ${profile.company}, ${profile.bio}, ${profile.phone}, ${profile.public_email},
            ${profile.website}, ${profile.location}, ${profile.photo_url},
            ${JSON.stringify(profile.social_links)}::jsonb, ${profile.template}, ${profile.is_published}
          )
        `;
      }
    } catch (error) {
      if (error.code === "23505") throw new ApiError(409, "That page address is already in use. Choose another.");
      throw error;
    }
    return json(200, { ok: true, slug: profile.slug, name: profile.name });
  }

  if (action === "customer_page_delete") {
    await requireAdmin(auth);
    const data = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON request body.");
    });
    if (!data || typeof data.id !== "string" || !data.id) throw new ApiError(422, "Choose a customer page to remove.");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.id)) {
      throw new ApiError(422, "Invalid customer page identifier.");
    }
    const deleted = await db.sql`delete from customer_pages where id = ${data.id} returning id`;
    if (!deleted[0]) throw new ApiError(404, "Customer page not found.");
    return json(200, { ok: true });
  }

  if (action === "profile_save") {
    await requireAdmin(auth);
    const data = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON request body.");
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(400, "Invalid request body.");
    const profile = validatedProfile(data);
    try {
      await db.sql`
        update profiles set
          name = ${profile.name}, slug = ${profile.slug}, profile_type = ${profile.profile_type},
          headline = ${profile.headline}, company = ${profile.company}, bio = ${profile.bio},
          phone = ${profile.phone}, public_email = ${profile.public_email}, website = ${profile.website},
          location = ${profile.location}, social_links = ${JSON.stringify(profile.social_links)}::jsonb,
          is_published = ${profile.is_published}, updated_at = now()
        where user_id = ${auth.user.id}
      `;
    } catch (error) {
      if (error.code === "23505") throw new ApiError(409, "That profile URL is already taken. Choose another one.");
      throw error;
    }
    return json(200, { ok: true, slug: profile.slug, name: profile.name });
  }

  if (action === "profile_photo_upload") {
    await requireAdmin(auth);
    let form;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Choose a valid profile photo.");
    }
    const photo = form.get("photo");
    if (!photo || typeof photo.arrayBuffer !== "function" || photo.size < 1 || photo.size > 5 * 1024 * 1024) {
      throw new ApiError(422, "Profile photos must be smaller than 5 MB.");
    }
    const imageTypes = {
      "image/jpeg": { extension: "jpg", matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
      "image/png": { extension: "png", matches: (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
      "image/webp": { extension: "webp", matches: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
    };
    const imageType = imageTypes[photo.type];
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!imageType || !imageType.matches(bytes)) throw new ApiError(422, "Choose a valid JPG, PNG, or WebP photo.");
    const dimensions = imageDimensions(bytes, photo.type);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 6000 || dimensions.height > 6000 || dimensions.width * dimensions.height > 24000000) {
      throw new ApiError(422, "Choose an image with dimensions under 6000 × 6000 pixels.");
    }
    const path = `${auth.user.id}/${crypto.randomUUID()}.${imageType.extension}`;
    await photos.set(path, bytes, { metadata: { contentType: photo.type } });
    try {
      await db.sql`
        update profiles set photo_path = ${path}, updated_at = now()
        where user_id = ${auth.user.id}
      `;
    } catch (error) {
      await photos.delete(path);
      throw error;
    }
    if (auth.profile.photo_path) {
      try {
        await photos.delete(auth.profile.photo_path);
      } catch (error) {
        console.error("TapLink could not remove the previous profile photo:", error);
      }
    }
    return json(200, { ok: true, photo_url: photoUrl(auth.profile.slug) });
  }

  if (action === "profile_photo_delete") {
    await requireAdmin(auth);
    await db.sql`
      update profiles set photo_path = null, updated_at = now()
      where user_id = ${auth.user.id}
    `;
    if (auth.profile.photo_path) {
      try {
        await photos.delete(auth.profile.photo_path);
      } catch (error) {
        console.error("TapLink could not remove the profile photo:", error);
      }
    }
    return json(200, { ok: true });
  }

  if (action === "admin_user_update") {
    await requireAdmin(auth);
    const data = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON request body.");
    });
    if (!data || typeof data !== "object" || typeof data.id !== "string" || !["user", "admin"].includes(data.role) || typeof data.active !== "boolean") {
      throw new ApiError(422, "Invalid user update.");
    }
    if (data.id === auth.user.id && (data.role !== "admin" || !data.active)) {
      throw new ApiError(422, "You cannot remove your own administrator access.");
    }
    const targetRows = await db.sql`select role, is_active from profiles where user_id = ${data.id} limit 1`;
    const target = targetRows[0];
    if (!target) throw new ApiError(404, "User not found.");
    if (target.role === "admin" && target.is_active && (data.role !== "admin" || !data.active)) {
      const admins = await db.sql`select count(*)::int as count from profiles where role = 'admin' and is_active = true`;
      if (admins[0].count <= 1) throw new ApiError(422, "The last active administrator cannot be disabled or demoted.");
    }
    await db.sql`
      update profiles set role = ${data.role}, is_active = ${data.active}, updated_at = now()
      where user_id = ${data.id}
    `;
    return json(200, { ok: true });
  }

  if (action === "admin_settings") {
    await requireAdmin(auth);
    const data = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON request body.");
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(400, "Invalid request body.");
    const appName = requiredText(data.app_name, "Application name", 80);
    await db.sql`
      insert into app_settings (setting_key, setting_value, updated_at)
      values ('app_name', ${appName}, now())
      on conflict (setting_key) do update
        set setting_value = excluded.setting_value, updated_at = now()
    `;
    return json(200, { ok: true });
  }

  throw new ApiError(404, "Not found.");
}

export default async (request, context) => {
  try {
    return await handle(request, context);
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { error: error.message });
    console.error("TapLink API request failed:", error);
    return json(500, { error: "The request could not be completed. Check the Netlify Database and Identity configuration." });
  }
};
