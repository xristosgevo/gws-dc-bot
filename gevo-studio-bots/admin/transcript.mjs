/**
 * Ticket-Transcripts: liest den kompletten Verlauf eines Kanals über die
 * Discord-REST-API, lädt alle Bilder, Dateien, Avatare, Emojis und Sticker
 * herunter (Discord-Links laufen nach ~24 h ab) und erzeugt daraus eine
 * statische Webseite im Discord-Look.
 *
 * Ablage: <dir>/<id>/index.html + data.json + avatars/ emojis/ stickers/ media/ files/
 * Die Seite enthält kein JavaScript; nginx liefert sie mit strikter CSP aus.
 * Alles aus Discord wird beim Rendern maskiert (esc) — Links nur http(s).
 */
import { createHash, randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const CDN = "https://cdn.discordapp.com";
const MAX_FILE = 100 * 1024 * 1024; // pro Datei
const MAX_TOTAL = 2 * 1024 * 1024 * 1024; // pro Transcript
const MAX_MESSAGES = 10000;
const GROUP_MS = 7 * 60 * 1000; // Nachrichten derselben Person innerhalb 7 min zusammenfassen
const TZ = "Europe/Berlin";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const snowflakeTime = (id) => Number((BigInt(id) >> 22n) + 1420070400000n);
const hex = (n) => (n ? `#${Number(n).toString(16).padStart(6, "0")}` : null);

const fmt = {
  full: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }),
  time: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, timeStyle: "short" }),
  timeS: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, timeStyle: "medium" }),
  date: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "medium" }),
  dateL: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "long" }),
  fullL: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "long", timeStyle: "short" }),
  fullF: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }),
  day: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }),
};

/* ---------- Discord-REST ------------------------------------------------------------ */

export function discordApi(token) {
  return async function get(p) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(`https://discord.com/api/v10${p}`, {
        headers: { Authorization: `Bot ${token}`, "User-Agent": "DiscordBot (https://gevo-studio.de, 1)" },
        signal: AbortSignal.timeout(30000),
      });
      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        await sleep((j.retry_after ?? 1) * 1000 + 250);
        continue;
      }
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error(`Discord ${r.status} für ${p}`);
      return r.json();
    }
    throw new Error(`Discord Rate-Limit für ${p}`);
  };
}

async function fetchAllMessages(api, channelId) {
  const all = [];
  let before = null;
  while (all.length < MAX_MESSAGES) {
    const batch = await api(`/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`);
    if (!batch?.length) break;
    all.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  return all.reverse();
}

/* ---------- Dateien archivieren ------------------------------------------------------------ */

/** Signierte Attachment-Links (…?ex=…&is=…&hm=…) zeigen auf dieselbe Datei → ohne Signatur vergleichen */
const keyOf = (url) => (/\/(ephemeral-)?attachments\//.test(url) ? url.split("?")[0] : url);

const EXT_BY_TYPE = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav",
};

class Assets {
  constructor(root) {
    this.root = root;
    this.byUrl = new Map(); // Original-URL → { rel, kind, done }
    this.total = 0;
  }

  /** URL vormerken; gibt den späteren relativen Pfad zurück */
  add(url, kind, filename) {
    if (!isHttp(url)) return null;
    const key = keyOf(url);
    if (this.byUrl.has(key)) return this.byUrl.get(key).rel;
    const h = createHash("sha1").update(key).digest("hex").slice(0, 16);
    let ext = (path.extname((filename ?? new URL(url).pathname).split("?")[0]) || "").toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
    let rel;
    if (kind === "files") {
      const safe = String(filename ?? "datei").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "datei";
      rel = `files/${h}-${safe}`;
    } else {
      if (!ext) ext = kind === "emojis" || kind === "avatars" ? ".png" : "";
      rel = `${kind}/${h}${ext}`;
    }
    this.byUrl.set(key, { url, rel, kind, done: false });
    return rel;
  }

  get(url) {
    if (!isHttp(url)) return null;
    const a = this.byUrl.get(keyOf(url));
    return a?.done ? a.rel : null;
  }

  async download(concurrency = 4) {
    const jobs = [...this.byUrl.values()];
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const a = jobs[next++];
        try {
          await mkdir(path.join(this.root, path.dirname(a.rel)), { recursive: true });
          const r = await fetch(a.url, { signal: AbortSignal.timeout(120000), headers: { "User-Agent": "GevoStudio-Transcript/1.0" } });
          if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
          const len = Number(r.headers.get("content-length") || 0);
          if (len > MAX_FILE || this.total + len > MAX_TOTAL) throw new Error("zu groß");
          // ohne Dateiendung (z. B. Link-Vorschauen): Endung aus dem Dateityp ergänzen
          const type = (r.headers.get("content-type") || "").split(";")[0].trim();
          if (a.kind !== "files" && !path.extname(a.rel) && EXT_BY_TYPE[type]) a.rel += EXT_BY_TYPE[type];
          let size = 0;
          const limiter = async function* (src, self) {
            for await (const chunk of src) {
              size += chunk.length;
              if (size > MAX_FILE || self.total + size > MAX_TOTAL) throw new Error("zu groß");
              yield chunk;
            }
          };
          await pipeline(Readable.fromWeb(r.body), (src) => limiter(src, this), createWriteStream(path.join(this.root, a.rel)));
          this.total += size;
          a.size = size;
          a.done = true;
        } catch (e) {
          a.error = e.message;
          await rm(path.join(this.root, a.rel), { force: true }).catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return jobs;
  }
}

/* ---------- Markdown (Discord-Variante) → HTML ------------------------------------------------- */

function markdown(src, ctx) {
  if (!src) return "";
  const slots = [];
  const hold = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(src).replace(/\u0000/g, "");

  // Code zuerst schützen
  s = s.replace(/```(?:([A-Za-z0-9_+-]{1,20})\n)?([\s\S]*?)```/g, (_, _lang, code) =>
    hold(`<pre class="cb"><code>${esc(code.replace(/^\n+|\n+$/g, ""))}</code></pre>`));
  s = s.replace(/``([^`]+?)``|`([^`\n]+?)`/g, (_, a, b) => hold(`<code class="ic">${esc(a ?? b)}</code>`));

  // Links: [Text](https://…) und nackte URLs
  s = s.replace(/\[([^\[\]\n]{1,256})\]\(\s*<?(https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?\s*\)/g, (_, label, url) =>
    hold(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${inline(esc(label), ctx)}</a>`));
  s = s.replace(/<?(https?:\/\/[^\s<>]*[^\s<>.,:;"')\]!?*_~|])>?/g, (_, url) =>
    hold(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(url)}</a>`));

  s = esc(s);

  // Discord-Tokens (nach dem Maskieren: &lt; … &gt;)
  s = s.replace(/&lt;(a?):([A-Za-z0-9_~]{1,32}):(\d{5,25})&gt;/g, (_, a, name, id) => {
    const src2 = ctx.src(`${CDN}/emojis/${id}.${a ? "gif" : "png"}?size=96&quality=lossless`);
    return src2 ? hold(`<img class="emoji" src="${src2}" alt=":${esc(name)}:" title=":${esc(name)}:">`) : `:${esc(name)}:`;
  });
  s = s.replace(/&lt;@!?(\d{5,25})&gt;/g, (_, id) => hold(`<span class="mention">@${esc(ctx.userName(id))}</span>`));
  s = s.replace(/&lt;@&amp;(\d{5,25})&gt;/g, (_, id) => {
    const r = ctx.roles[id];
    const c = r?.color ? ` style="color:${r.color};background:${r.color}26"` : "";
    return hold(`<span class="mention"${c}>@${esc(r?.name ?? "gelöschte Rolle")}</span>`);
  });
  s = s.replace(/&lt;#(\d{5,25})&gt;/g, (_, id) => hold(`<span class="mention">#${esc(ctx.channels[id] ?? "unbekannter-kanal")}</span>`));
  s = s.replace(/&lt;\/([\w -]{1,64}):(\d{5,25})&gt;/g, (_, name) => hold(`<span class="mention">/${esc(name)}</span>`));
  s = s.replace(/&lt;t:(-?\d{1,13})(?::([tTdDfFR]))?&gt;/g, (_, t, f) => hold(`<span class="stamp">${esc(stamp(Number(t) * 1000, f))}</span>`));
  s = s.replace(/(^|[\s(])@(everyone|here)\b/g, (_, pre, w) => `${pre}${hold(`<span class="mention">@${w}</span>`)}`);

  // Zeilen: Zitate, Überschriften, Subtext, Listen
  const blocks = [];
  let quoteAll = false;
  for (let line of s.split("\n")) {
    let quoted = quoteAll;
    const qa = /^&gt;&gt;&gt; ?(.*)$/.exec(line);
    if (!quoted && qa) { quoteAll = true; quoted = true; line = qa[1]; }
    const q = !quoted && /^&gt; ?(.*)$/.exec(line);
    if (q) { quoted = true; line = q[1]; }
    let m;
    if ((m = /^(#{1,3}) (.+)$/.exec(line))) blocks.push({ kind: `h${m[1].length}`, quoted, html: inline(m[2], ctx) });
    else if ((m = /^-# (.+)$/.exec(line))) blocks.push({ kind: "sub", quoted, html: inline(m[1], ctx) });
    else if ((m = /^(\s*)[-*] (.+)$/.exec(line))) blocks.push({ kind: "li", quoted, depth: m[1].length >= 2 ? 1 : 0, html: inline(m[2], ctx) });
    else if ((m = /^(\s*)(\d{1,3})\. (.+)$/.exec(line))) blocks.push({ kind: "oli", quoted, start: Number(m[2]), html: inline(m[3], ctx) });
    else blocks.push({ kind: "p", quoted, html: inline(line, ctx) });
  }
  const html = renderBlocks(blocks);
  return html.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
}

function renderBlocks(blocks) {
  let out = "";
  for (let i = 0; i < blocks.length;) {
    const b = blocks[i];
    if (b.quoted) {
      const group = [];
      while (i < blocks.length && blocks[i].quoted) group.push({ ...blocks[i++], quoted: false });
      out += `<blockquote>${renderBlocks(group)}</blockquote>`;
      continue;
    }
    if (b.kind === "li" || b.kind === "oli") {
      const tag = b.kind === "li" ? "ul" : "ol";
      const start = b.kind === "oli" && b.start !== 1 ? ` start="${b.start}"` : "";
      let items = "";
      while (i < blocks.length && blocks[i].kind === b.kind && !blocks[i].quoted) {
        items += `<li${blocks[i].depth ? ' class="d1"' : ""}>${blocks[i].html}</li>`;
        i++;
      }
      out += `<${tag}${start}>${items}</${tag}>`;
      continue;
    }
    if (b.kind === "sub") out += `<div class="sub">${b.html}</div>`;
    else if (b.kind.startsWith("h")) out += `<${b.kind}>${b.html}</${b.kind}>`;
    else out += `<div class="l">${b.html || "<br>"}</div>`;
    i++;
  }
  return out;
}

/** Fett/kursiv/unterstrichen/durchgestrichen/Spoiler auf bereits maskiertem Text */
function inline(s) {
  return s
    .replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" tabindex="0">$1</span>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>");
}

function stamp(ms, f) {
  const d = new Date(ms);
  switch (f) {
    case "t": return fmt.time.format(d);
    case "T": return fmt.timeS.format(d);
    case "d": return fmt.day.format(d);
    case "D": return fmt.dateL.format(d);
    case "F": return fmt.fullF.format(d);
    default: return fmt.fullL.format(d); // f, R und ohne Format
  }
}

/* ---------- Rendern ---------------------------------------------------------------------------- */

const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

function fileCard(name, size, src) {
  const link = src
    ? `<a href="${src}" download="${esc(name)}">${esc(name)}</a>`
    : `<span>${esc(name)}</span>`;
  return `<div class="file"><div class="ficon">📄</div><div class="fmeta">${link}<div class="fsize">${size ? fileSize(size) : ""}${src ? "" : " · nicht archiviert"}</div></div></div>`;
}

function fitDims(w, h, maxW = 400, maxH = 350) {
  if (!w || !h) return "";
  const k = Math.min(1, maxW / w, maxH / h);
  return ` width="${Math.round(w * k)}" height="${Math.round(h * k)}"`;
}

function renderAttachment(a, ctx) {
  const src = ctx.src(a.url);
  const type = a.content_type ?? "";
  const spoiler = a.filename?.startsWith("SPOILER_") ? " sp" : "";
  if (src && type.startsWith("image/")) {
    return `<a class="att${spoiler}" href="${src}" target="_blank"><img loading="lazy" src="${src}" alt="${esc(a.filename)}"${fitDims(a.width, a.height)}></a>`;
  }
  if (src && type.startsWith("video/")) return `<video class="att${spoiler}" controls preload="metadata" src="${src}"${fitDims(a.width, a.height)}></video>`;
  if (src && type.startsWith("audio/")) return `<div class="file audio">${fileCard(a.filename, a.size, src)}<audio controls preload="none" src="${src}"></audio></div>`;
  return fileCard(a.filename, a.size, src);
}

function emojiTag(e, ctx, cls = "emoji") {
  if (!e) return "";
  if (e.id) {
    const src = ctx.src(`${CDN}/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=96&quality=lossless`);
    return src ? `<img class="${cls}" src="${src}" alt=":${esc(e.name)}:">` : `:${esc(e.name)}:`;
  }
  return `<span class="${cls} uni">${esc(e.name)}</span>`;
}

function renderEmbed(e, ctx) {
  const color = hex(e.color) ?? "#1e1f22";
  const img = (x, cls) => {
    const src = x && ctx.src(x.proxy_url ?? x.url);
    return src ? `<img class="${cls}" loading="lazy" src="${src}" alt=""${cls === "eimg" ? fitDims(x.width, x.height, 400, 300) : ""}>` : "";
  };
  const link = (u, inner) => (isHttp(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${inner}</a>` : inner);
  let body = "";
  if (e.author?.name) body += `<div class="eauthor">${img(e.author.icon_url ? { url: e.author.proxy_icon_url ?? e.author.icon_url } : null, "eaicon")}${link(e.author.url, esc(e.author.name))}</div>`;
  if (e.title) body += `<div class="etitle">${link(e.url, markdown(e.title, ctx))}</div>`;
  if (e.description) body += `<div class="edesc">${markdown(e.description, ctx)}</div>`;
  if (e.fields?.length) {
    body += `<div class="efields">${e.fields.map((f) =>
      `<div class="efield${f.inline ? " inl" : ""}"><div class="efname">${markdown(f.name, ctx)}</div><div class="efval">${markdown(f.value, ctx)}</div></div>`).join("")}</div>`;
  }
  if (e.image) body += img(e.image, "eimg");
  else if (e.video && e.thumbnail) body += img(e.thumbnail, "eimg");
  if (e.footer?.text || e.timestamp) {
    body += `<div class="efooter">${img(e.footer?.icon_url ? { url: e.footer.proxy_icon_url ?? e.footer.icon_url } : null, "eficon")}${esc(e.footer?.text ?? "")}${e.footer?.text && e.timestamp ? " · " : ""}${e.timestamp ? fmt.full.format(new Date(e.timestamp)) : ""}</div>`;
  }
  const thumb = !e.video && e.thumbnail ? img(e.thumbnail, "ethumb") : "";
  if (e.type === "gifv" && e.video) {
    const v = ctx.src(e.video.proxy_url ?? e.video.url);
    if (v) return `<video class="att" autoplay loop muted playsinline src="${v}"${fitDims(e.video.width, e.video.height)}></video>`;
  }
  if (e.type === "image" && e.thumbnail && !body) return img(e.thumbnail, "eimg").replace('class="eimg"', 'class="att-img"');
  return `<div class="embed" style="border-left-color:${color}"><div class="ebody">${body}</div>${thumb}</div>`;
}

const BTN_CLASS = { 1: "primary", 2: "secondary", 3: "success", 4: "danger", 5: "secondary link", 6: "primary" };

function renderComponent(c, ctx, msg) {
  switch (c.type) {
    case 1: return `<div class="row">${(c.components ?? []).map((x) => renderComponent(x, ctx, msg)).join("")}</div>`;
    case 2: {
      const inner = `${emojiTag(c.emoji, ctx, "bemoji")}${c.label ? `<span>${esc(c.label)}</span>` : ""}${c.style === 5 ? '<span class="ext">↗</span>' : ""}`;
      return c.style === 5 && isHttp(c.url)
        ? `<a class="btn ${BTN_CLASS[5]}" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer nofollow">${inner}</a>`
        : `<span class="btn ${BTN_CLASS[c.style] ?? "secondary"}${c.disabled ? " off" : ""}">${inner}</span>`;
    }
    case 3: case 5: case 6: case 7: case 8:
      return `<div class="select"><span>${esc(c.placeholder ?? "Auswählen …")}</span><span class="caret">⌄</span></div>`;
    case 9: {
      const acc = c.accessory ? renderComponent(c.accessory, ctx, msg) : "";
      return `<div class="section"><div class="stext">${(c.components ?? []).map((x) => renderComponent(x, ctx, msg)).join("")}</div><div class="sacc">${acc}</div></div>`;
    }
    case 10: return `<div class="td">${markdown(c.content, ctx)}</div>`;
    case 11: {
      const src = ctx.src(c.media?.url);
      return src ? `<img class="thumb" loading="lazy" src="${src}" alt="">` : "";
    }
    case 12: {
      const items = (c.items ?? []).map((it) => {
        const src = ctx.src(it.media?.url);
        if (!src) return "";
        const isVideo = /^video\//.test(it.media?.content_type ?? "");
        return isVideo ? `<video controls preload="metadata" src="${src}"></video>` : `<a href="${src}" target="_blank"><img loading="lazy" src="${src}" alt=""></a>`;
      }).join("");
      return `<div class="gallery g${Math.min(c.items?.length ?? 1, 4)}">${items}</div>`;
    }
    case 13: {
      const url = c.file?.url ?? "";
      const att = url.startsWith("attachment://") ? msg.attachments?.find((a) => a.filename === url.slice(13)) : null;
      const name = att?.filename ?? url.split("/").pop()?.split("?")[0] ?? "Datei";
      return fileCard(name, att?.size ?? c.size, ctx.src(att?.url ?? url));
    }
    case 14: return c.divider === false ? `<div class="gap${c.spacing === 2 ? " lg" : ""}"></div>` : `<hr class="sep${c.spacing === 2 ? " lg" : ""}">`;
    case 17: {
      const accent = hex(c.accent_color);
      return `<div class="v2${c.spoiler ? " sp" : ""}"${accent ? ` style="border-left-color:${accent}"` : ""}>${(c.components ?? []).map((x) => renderComponent(x, ctx, msg)).join("")}</div>`;
    }
    default: return "";
  }
}

function plainSnippet(content) {
  return String(content ?? "")
    .replace(/<a?:(\w+):\d+>/g, ":$1:").replace(/<@!?\d+>/g, "@…").replace(/[*_~|`>#]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 100);
}

const SYSTEM_TEXT = {
  6: "hat eine Nachricht an diesen Kanal angeheftet.",
  7: "ist dem Server beigetreten.",
  8: "hat den Server geboostet.",
  18: "hat einen Thread gestartet.",
};

function renderMessage(m, prev, ctx) {
  const u = ctx.user(m.author);
  const t = new Date(m.timestamp);
  const isSystem = SYSTEM_TEXT[m.type];
  const cont = prev && !isSystem && !m.message_reference && prev.author.id === m.author.id &&
    t - new Date(prev.timestamp) < GROUP_MS && !SYSTEM_TEXT[prev.type] && !m.interaction_metadata;

  if (isSystem) {
    return `<div class="msg sys" id="m${m.id}"><div class="gutter">➜</div><div class="body"><span class="name" style="color:${u.color}">${esc(u.name)}</span> ${isSystem} <span class="ts">${fmt.full.format(t)}</span></div></div>`;
  }

  let pre = "";
  if (m.referenced_message) {
    const r = m.referenced_message;
    const ru = ctx.user(r.author);
    pre = `<div class="reply"><img class="rav" src="${ru.avatar}" alt=""><span class="name" style="color:${ru.color}">@${esc(ru.name)}</span><span class="snip">${esc(plainSnippet(r.content) || (r.attachments?.length ? "Anhang" : "Nachricht"))}</span></div>`;
  } else if (m.message_reference && m.type === 19) {
    pre = `<div class="reply"><span class="snip">Die ursprüngliche Nachricht wurde gelöscht.</span></div>`;
  }
  const im = m.interaction_metadata ?? m.interaction;
  if (im?.user && (im.name || m.interaction?.name)) {
    const iu = ctx.user(im.user);
    pre += `<div class="reply cmd"><img class="rav" src="${iu.avatar}" alt=""><span class="name" style="color:${iu.color}">${esc(iu.name)}</span><span class="snip">hat <span class="cmdname">/${esc(im.name ?? m.interaction?.name)}</span> verwendet</span></div>`;
  }

  const onlyEmoji = m.content && /^(\s*(<a?:\w+:\d+>|\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|️)*)\s*){1,27}$/u.test(m.content);
  let body = m.content ? `<div class="content${onlyEmoji ? " jumbo" : ""}">${markdown(m.content, ctx)}${m.edited_timestamp ? '<span class="edited">(bearbeitet)</span>' : ""}</div>` : "";
  body += (m.attachments ?? []).filter((a) => !(m.flags & (1 << 15)) || !(m.components ?? []).length).map((a) => renderAttachment(a, ctx)).join("");
  body += (m.sticker_items ?? []).map((st) => {
    const src = st.format_type === 3 ? null : ctx.src(`${CDN}/stickers/${st.id}.${st.format_type === 4 ? "gif" : "png"}?size=320`);
    return src ? `<img class="sticker" src="${src}" alt="${esc(st.name)}" title="${esc(st.name)}">` : `<div class="sub">Sticker: ${esc(st.name)}</div>`;
  }).join("");
  body += (m.embeds ?? []).map((e) => renderEmbed(e, ctx)).join("");
  body += (m.components ?? []).map((c) => renderComponent(c, ctx, m)).join("");
  if (m.poll) body += `<div class="v2"><strong>Umfrage:</strong> ${esc(m.poll.question?.text ?? "")}<ul>${(m.poll.answers ?? []).map((a) => `<li>${esc(a.poll_media?.text ?? "")}</li>`).join("")}</ul></div>`;
  if (m.reactions?.length) {
    body += `<div class="reactions">${m.reactions.map((r) => `<span class="reaction">${emojiTag(r.emoji, ctx, "remoji")}<span>${r.count}</span></span>`).join("")}</div>`;
  }

  const badge = u.bot ? '<span class="badge">APP</span>' : "";
  const head = cont
    ? `<div class="gutter"><span class="hts">${fmt.time.format(t)}</span></div>`
    : `<img class="av" src="${u.avatar}" alt="">`;
  const name = cont ? "" : `<div class="hdr"><span class="name" style="color:${u.color}">${esc(u.name)}</span>${badge}<span class="ts">${fmt.full.format(t)}</span></div>`;
  return `${pre ? `<div class="pre">${pre}</div>` : ""}<div class="msg${cont ? " cont" : ""}${pre ? " haspre" : ""}" id="m${m.id}">${head}<div class="body">${name}${body}</div></div>`;
}

const CSS = `
:root{--bg:#313338;--bg2:#2b2d31;--bg3:#1e1f22;--text:#dbdee1;--head:#f2f3f5;--muted:#949ba4;--link:#00a8fc;--line:#3f4147}
*{box-sizing:border-box}html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.375 "gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;height:56px;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--bg3);box-shadow:0 1px 0 rgba(4,4,5,.2),0 1.5px 0 rgba(6,6,7,.05),0 2px 0 rgba(4,4,5,.05)}
.top .gicon{width:32px;height:32px;border-radius:50%}.top .hash{color:var(--muted);font-size:24px;font-weight:400;margin-right:2px}
.top .cname{font-weight:600;color:var(--head)}.top .topic{color:var(--muted);font-size:14px;border-left:1px solid var(--line);padding-left:12px;margin-left:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
main{padding:0 0 32px}
.start{padding:32px 16px 16px}
.start .big{width:68px;height:68px;border-radius:50%;background:#41434a;display:grid;place-items:center;font-size:40px;color:#fff;font-weight:300}
.start h1{font-size:32px;line-height:40px;margin:8px 0;color:var(--head)}
.start p{margin:0;color:var(--muted)}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.fact{background:var(--bg2);border-radius:8px;padding:8px 12px;font-size:14px}.fact b{color:var(--head)}
.daysep{display:flex;align-items:center;margin:24px 16px 8px;color:var(--muted);font-size:12px;font-weight:600}
.daysep:before,.daysep:after{content:"";flex:1;height:1px;background:var(--line)}.daysep span{padding:0 8px}
.msg{display:flex;gap:16px;padding:2px 48px 2px 16px;margin-top:17px;position:relative}.msg.cont{margin-top:0}.msg.haspre{margin-top:0}
.msg:hover{background:#2e3035}
.av{width:40px;height:40px;border-radius:50%;flex:none;margin-top:2px;background:var(--bg3)}
.gutter{width:40px;flex:none;text-align:right;color:var(--muted);font-size:11px;padding-top:4px}
.hts{visibility:hidden}.msg:hover .hts{visibility:visible}
.body{min-width:0;flex:1}
.hdr{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.name{font-weight:500;color:var(--head)}
.badge{background:#5865f2;color:#fff;font-size:10px;font-weight:600;line-height:15px;padding:0 4px;border-radius:3px;position:relative;top:-1px}
.ts{font-size:12px;color:var(--muted);margin-left:2px}
.content{word-wrap:break-word;overflow-wrap:anywhere}
.content .l{min-height:1px}
.edited{font-size:10px;color:var(--muted);margin-left:4px}
.pre{margin-top:17px}
.reply{display:flex;align-items:center;gap:4px;margin-left:72px;font-size:14px;color:var(--muted);position:relative;white-space:nowrap;overflow:hidden}
.reply:before{content:"";position:absolute;left:-36px;top:50%;width:33px;height:12px;border-left:2px solid #4e5058;border-top:2px solid #4e5058;border-top-left-radius:6px}
.reply .rav{width:16px;height:16px;border-radius:50%}.reply .name{font-size:14px;margin-right:4px}.reply .snip{overflow:hidden;text-overflow:ellipsis}
.cmdname{color:var(--link)}
.mention{background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px;font-weight:500}
.stamp{background:rgba(255,255,255,.06);border-radius:3px;padding:0 2px}
.emoji{width:1.375em;height:1.375em;vertical-align:bottom;object-fit:contain;margin:0 .05em}
.emoji.uni{width:auto;height:auto}
.jumbo .emoji{width:48px;height:48px}.jumbo{font-size:2.6em;line-height:1.2}
code.ic{background:var(--bg3);border-radius:4px;padding:.1em .3em;font-size:85%;font-family:Consolas,"Andale Mono WT","Andale Mono","Lucida Console",monospace}
pre.cb{background:var(--bg2);border:1px solid var(--bg3);border-radius:4px;padding:8px;margin:6px 0;max-width:90%;overflow:auto;white-space:pre-wrap;font-size:14px;line-height:18px;font-family:Consolas,"Andale Mono WT","Andale Mono","Lucida Console",monospace;color:#dbdee1}
blockquote{margin:2px 0;padding:0 8px 0 12px;border-left:4px solid #4e5058;border-radius:4px}
h1,h2,h3{color:var(--head);margin:8px 0 4px;line-height:1.375}h1{font-size:24px}h2{font-size:20px}h3{font-size:16px}
.sub{font-size:13px;color:var(--muted);line-height:1.3}
ul,ol{margin:4px 0 0 16px;padding-left:16px}li.d1{margin-left:16px}
.spoiler{background:#1e1f22;color:transparent;border-radius:3px;padding:0 2px;cursor:pointer}
.spoiler *{visibility:hidden}.spoiler:hover,.spoiler:focus{background:rgba(255,255,255,.1);color:inherit;outline:0}.spoiler:hover *,.spoiler:focus *{visibility:visible}
.att{display:block;margin-top:4px;max-width:min(400px,100%);border-radius:8px;overflow:hidden}
.att img,video.att{display:block;max-width:min(400px,100%);max-height:350px;height:auto;border-radius:8px}
.att.sp img{filter:blur(44px)}.att.sp:hover img{filter:none}
.att-img{display:block;max-width:min(400px,100%);border-radius:8px;margin-top:4px}
.sticker{width:160px;height:160px;object-fit:contain;margin-top:4px}
.file{display:flex;gap:10px;align-items:center;background:var(--bg2);border:1px solid var(--bg3);border-radius:8px;padding:10px 12px;max-width:432px;margin-top:4px}
.file.audio{display:block}.file.audio .file{border:0;padding:0;margin:0}.file audio{width:100%;margin-top:8px}
.ficon{font-size:28px;line-height:1}.fmeta{min-width:0}.fmeta a,.fmeta span{word-break:break-all}.fsize{font-size:12px;color:var(--muted)}
.embed{display:flex;gap:16px;max-width:520px;background:var(--bg2);border-radius:4px;border-left:4px solid #1e1f22;margin-top:4px;padding:8px 16px 16px 12px}
.ebody{min-width:0;flex:1}.eauthor{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--head);margin-top:8px}
.eaicon,.eficon{width:24px;height:24px;border-radius:50%}.eficon{width:20px;height:20px}
.etitle{font-weight:600;color:var(--head);margin-top:8px}.edesc{font-size:14px;margin-top:8px}
.efields{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.efield{grid-column:1/-1;font-size:14px}.efield.inl{grid-column:auto}.efname{font-weight:600;color:var(--head)}
.eimg{display:block;max-width:100%;border-radius:4px;margin-top:16px}.ethumb{width:80px;height:80px;object-fit:contain;border-radius:4px;margin-top:8px}
.efooter{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-top:8px}
.v2{background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-left:4px solid transparent;border-radius:8px;max-width:600px;padding:16px;margin-top:4px;display:flex;flex-direction:column;gap:8px}
.v2.sp{filter:blur(6px)}.v2.sp:hover{filter:none}
.td{word-wrap:break-word}.td .l{min-height:1px}
.gallery{display:grid;gap:4px;border-radius:8px;overflow:hidden}.gallery.g2{grid-template-columns:1fr 1fr}.gallery.g3,.gallery.g4{grid-template-columns:1fr 1fr}
.gallery img,.gallery video{display:block;width:100%;height:auto;max-height:420px;object-fit:cover}
.section{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.stext{min-width:0;flex:1;display:flex;flex-direction:column;gap:8px}.sacc{flex:none}
.thumb{width:85px;height:85px;border-radius:8px;object-fit:cover}
hr.sep{border:0;border-top:1px solid var(--line);margin:0;width:100%}hr.sep.lg{margin:8px 0}.gap{height:0}.gap.lg{height:16px}
.row{display:flex;flex-wrap:wrap;gap:8px}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:2px 16px;border-radius:8px;font-size:14px;font-weight:500;color:#fff;background:#4e5058;text-decoration:none!important}
.btn.primary{background:#5865f2}.btn.success{background:#248046}.btn.danger{background:#da373c}.btn.off{opacity:.5}
.btn .bemoji{width:20px;height:20px;object-fit:contain}.btn .ext{font-size:12px}
.select{display:flex;justify-content:space-between;align-items:center;max-width:400px;min-height:40px;padding:0 12px;border-radius:8px;background:var(--bg3);color:var(--muted);border:1px solid #1e1f22}
.reactions{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap}
.reaction{display:inline-flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid transparent;border-radius:8px;padding:2px 6px;font-size:14px;font-weight:600}
.remoji{width:16px;height:16px;object-fit:contain}.remoji.uni{width:auto;height:auto}
.msg.sys .body{color:var(--muted);font-size:15px;padding:2px 0}
footer{margin:24px 16px 32px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media (max-width:640px){.msg{padding-right:16px}.reply{margin-left:64px}.top .topic{display:none}}
`;

function renderPage(data, ctx) {
  const t = data.ticket;
  const owner = t.ownerId ? `<span class="mention">@${esc(ctx.userName(t.ownerId))}</span>` : "unbekannt";
  const closer = t.closedById ? `<span class="mention">@${esc(ctx.userName(t.closedById))}</span>` : "unbekannt";
  let html = "";
  let prev = null;
  let day = "";
  for (const m of data.messages) {
    const d = fmt.dateL.format(new Date(m.timestamp));
    if (d !== day) {
      html += `<div class="daysep"><span>${esc(d)}</span></div>`;
      day = d;
      prev = null;
    }
    html += renderMessage(m, prev, ctx);
    prev = m;
  }
  const gicon = data.guild.icon ? `<img class="gicon" src="${ctx.src(data.guild.icon)}" alt="">` : "";
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>Transcript · #${esc(data.channel.name)} · ${esc(data.guild.name)}</title>
<style>${CSS}</style></head>
<body>
<header class="top">${gicon}<div class="cname"><span class="hash">#</span>${esc(data.channel.name)}</div><div class="topic">Transcript · ${esc(data.guild.name)}</div></header>
<main>
<section class="start">
<div class="big">#</div>
<h1>Transcript von #${esc(data.channel.name)}</h1>
<p>${esc(t.typeLabel ?? "Ticket")}-Ticket${t.nr ? ` #${esc(t.nr)}` : ""} · geöffnet von ${owner} am ${esc(fmt.full.format(new Date(t.openedAt)))} · geschlossen von ${closer} am ${esc(fmt.full.format(new Date(data.createdAt)))}</p>
<div class="facts"><div class="fact"><b>${data.stats.messages}</b> Nachrichten</div><div class="fact"><b>${data.stats.files}</b> Dateien &amp; Bilder</div><div class="fact"><b>${data.stats.participants}</b> Teilnehmer</div></div>
</section>
${html}
</main>
<footer>Archiviert von ${esc(data.guild.name)} am ${esc(fmt.full.format(new Date(data.createdAt)))}. Alle Bilder und Dateien sind auf diesem Server gespeichert. Dieses Transcript ist privat – teile den Link nur mit Beteiligten.</footer>
</body></html>`;
}

/* ---------- Haupteinstieg --------------------------------------------------------------------------- */

/**
 * Erstellt das Transcript eines Kanals.
 * @returns {{ id, url, dir, stats, lightHtml: Buffer|null }}
 */
export async function createTranscript({ api, guildId, channelId, ticket = {}, closedById, outDir, baseUrl, typeLabels = {} }) {
  const id = randomBytes(16).toString("base64url");
  const dir = path.join(outDir, id);
  await mkdir(dir, { recursive: true });
  const assets = new Assets(dir);

  const [guild, channel, roles, channels, messages] = await Promise.all([
    api(`/guilds/${guildId}`),
    api(`/channels/${channelId}`),
    api(`/guilds/${guildId}/roles`),
    api(`/guilds/${guildId}/channels`),
    fetchAllMessages(api, channelId),
  ]);

  const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.id, { name: r.name, color: hex(r.color), position: r.position }]));
  const channelMap = Object.fromEntries((channels ?? []).map((c) => [c.id, c.name]));

  // Personen: Autoren + Erwähnte; Server-Profil (Spitzname, Rollenfarbe, Server-Avatar) für Autoren
  const people = new Map();
  const remember = (u) => { if (u?.id && !people.has(u.id)) people.set(u.id, { user: u, member: null }); };
  for (const m of messages) {
    remember(m.author);
    (m.mentions ?? []).forEach(remember);
    if (m.referenced_message) remember(m.referenced_message.author);
    if (m.interaction_metadata?.user) remember(m.interaction_metadata.user);
    if (m.interaction?.user) remember(m.interaction.user);
  }
  for (const pid of [ticket.ownerId, closedById]) {
    if (pid && !people.has(pid)) {
      const u = await api(`/users/${pid}`);
      if (u) remember(u);
    }
  }
  const authorIds = new Set([...messages.map((m) => m.author.id), ticket.ownerId, closedById].filter(Boolean));
  for (const uid of authorIds) {
    const member = await api(`/guilds/${guildId}/members/${uid}`);
    if (member && people.has(uid)) people.get(uid).member = member;
  }

  const users = {};
  for (const [uid, { user, member }] of people) {
    const top = (member?.roles ?? []).map((r) => roleMap[r]).filter((r) => r?.color).sort((a, b) => b.position - a.position)[0];
    let avatarUrl;
    if (member?.avatar) avatarUrl = `${CDN}/guilds/${guildId}/users/${uid}/avatars/${member.avatar}.png?size=128`;
    else if (user.avatar) avatarUrl = `${CDN}/avatars/${uid}/${user.avatar}.png?size=128`;
    else avatarUrl = `${CDN}/embed/avatars/${Number((BigInt(uid) >> 22n) % 6n)}.png`;
    users[uid] = {
      name: member?.nick ?? user.global_name ?? user.username ?? "Unbekannt",
      username: user.username,
      bot: !!user.bot,
      color: top?.color ?? "#f2f3f5",
      avatarUrl,
      avatar: assets.add(avatarUrl, "avatars"),
    };
  }

  // Alle Bilder/Dateien/Emojis vormerken
  const emojiUrl = (eid, animated) => `${CDN}/emojis/${eid}.${animated ? "gif" : "png"}?size=96&quality=lossless`;
  const scanText = (txt) => { for (const [, a, , eid] of String(txt ?? "").matchAll(/<(a?):(\w+):(\d+)>/g)) assets.add(emojiUrl(eid, !!a), "emojis"); };
  const scanComponent = (c, msg) => {
    if (!c) return;
    if (c.content) scanText(c.content);
    if (c.emoji?.id) assets.add(emojiUrl(c.emoji.id, c.emoji.animated), "emojis");
    if (c.type === 11 && c.media?.url) assets.add(c.media.url, "media");
    if (c.type === 12) (c.items ?? []).forEach((it) => it.media?.url && assets.add(it.media.url, "media"));
    if (c.type === 13) {
      const url = c.file?.url ?? "";
      const att = url.startsWith("attachment://") ? msg.attachments?.find((a) => a.filename === url.slice(13)) : null;
      assets.add(att?.url ?? url, "files", att?.filename);
    }
    (c.components ?? []).forEach((x) => scanComponent(x, msg));
    if (c.accessory) scanComponent(c.accessory, msg);
  };
  let fileCount = 0;
  for (const m of messages) {
    scanText(m.content);
    for (const a of m.attachments ?? []) {
      const media = /^(image|video|audio)\//.test(a.content_type ?? "");
      assets.add(a.url, media ? "media" : "files", a.filename);
      fileCount++;
    }
    for (const e of m.embeds ?? []) {
      scanText(e.title); scanText(e.description);
      (e.fields ?? []).forEach((f) => { scanText(f.name); scanText(f.value); });
      for (const x of [e.image, e.thumbnail]) if (x) assets.add(x.proxy_url ?? x.url, "media");
      if (e.type === "gifv" && e.video) assets.add(e.video.proxy_url ?? e.video.url, "media");
      if (e.author?.icon_url) assets.add(e.author.proxy_icon_url ?? e.author.icon_url, "media");
      if (e.footer?.icon_url) assets.add(e.footer.proxy_icon_url ?? e.footer.icon_url, "media");
    }
    (m.components ?? []).forEach((c) => scanComponent(c, m));
    for (const r of m.reactions ?? []) if (r.emoji?.id) assets.add(emojiUrl(r.emoji.id, r.emoji.animated), "emojis");
    for (const st of m.sticker_items ?? []) if (st.format_type !== 3) assets.add(`${CDN}/stickers/${st.id}.${st.format_type === 4 ? "gif" : "png"}?size=320`, "stickers");
  }
  const guildIcon = guild?.icon ? `${CDN}/icons/${guildId}/${guild.icon}.png?size=128` : null;
  if (guildIcon) assets.add(guildIcon, "avatars");

  const jobs = await assets.download();
  const failed = jobs.filter((j) => !j.done).map((j) => ({ url: j.url, error: j.error }));

  const data = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    guild: { id: guildId, name: guild?.name ?? "Server", icon: guildIcon },
    channel: { id: channelId, name: channel?.name ?? "ticket", topic: channel?.topic ?? null },
    ticket: {
      type: ticket.type ?? null,
      typeLabel: typeLabels[ticket.type] ?? ticket.type ?? "Ticket",
      nr: ticket.nr ?? null,
      ownerId: ticket.ownerId ?? null,
      closedById: closedById ?? null,
      openedAt: snowflakeTime(channelId),
    },
    stats: { messages: messages.length, files: fileCount, participants: new Set(messages.map((m) => m.author.id)).size, failedDownloads: failed.length },
    users,
    roles: roleMap,
    channels: channelMap,
    assets: Object.fromEntries(jobs.filter((j) => j.done).map((j) => [keyOf(j.url), j.rel])),
    failed,
    messages,
  };

  const baseCtx = {
    roles: roleMap,
    channels: channelMap,
    userName: (uid) => users[uid]?.name ?? "Unbekannt",
  };
  const makeCtx = (srcOf) => ({
    ...baseCtx,
    src: (url) => { const rel = assets.get(url); return rel ? srcOf(rel) : null; },
    user: (u) => {
      const x = users[u?.id] ?? { name: u?.global_name ?? u?.username ?? "Unbekannt", color: "#f2f3f5", bot: !!u?.bot };
      const rel = x.avatar && assets.get(x.avatarUrl);
      return { ...x, avatar: rel ? srcOf(rel) : `${CDN}/embed/avatars/0.png` };
    },
  });

  // 1) Webseite mit relativen Pfaden (liegt neben den Dateien)
  await writeFile(path.join(dir, "index.html"), renderPage({ ...data, guild: { ...data.guild, icon: guildIcon } }, makeCtx((rel) => rel)));
  await writeFile(path.join(dir, "data.json"), JSON.stringify(data));

  // 2) Sicherungskopie als eine Datei (für Discord): kompletter Text, Bilder über die Website verlinkt
  const absolute = `${baseUrl.replace(/\/$/, "")}/${id}/`;
  const light = Buffer.from(renderPage(data, makeCtx((rel) => `${absolute}${rel}`)));

  const size = (await stat(path.join(dir, "index.html"))).size;
  return {
    id,
    url: absolute,
    dir,
    stats: { ...data.stats, bytes: assets.total + size },
    lightHtml: light.length <= 8 * 1024 * 1024 ? light : null,
  };
}

/** Nur für Tests: Markdown-Renderer und Nachrichtendarstellung */
export const __test = { markdown, renderMessage };
