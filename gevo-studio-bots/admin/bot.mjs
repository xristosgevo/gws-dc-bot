/**
 * Bot "GWS | Administration" — Ticketsystem, Verifizierung, Rechtliches,
 * Lieferzeit, Preisliste, Willkommensnachricht und Bewertungen.
 *
 * Start:  node --env-file=.env.local bot/admin/bot.mjs   (npm run admin-bot)
 * Token:  ADMIN_BOT_TOKEN in .env.local
 *
 * Design: panels-v2.mjs. Ältere Nachrichten (Auswahlmenüs gevo:ticket_select /
 * gevo:legal_select, Kauf-Tickets mit gevo:ticket_close) funktionieren weiter.
 */
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.mjs";
import { DEFAULT_DELIVERY, DELIVERY_LEVELS } from "./panels.mjs";
import * as V from "./panels-v2.mjs";
import { createTranscript, discordApi } from "./transcript.mjs";

const TOKEN = process.env.ADMIN_BOT_TOKEN;
if (!TOKEN) {
  console.error("ADMIN_BOT_TOKEN fehlt in .env.local");
  process.exit(1);
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const V2 = MessageFlags.IsComponentsV2;
const PRIVATE = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const { B } = V;
const avatarOf = (user) => user.displayAvatarURL({ extension: "png", size: 256 });

/* ---------- Zustand (Lieferzeit, Ticket-Nummern, Panel-Nachrichten) ------- */

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}
// reviews: Kauf-Ticket-Nr → { userId, status: "pending" | "done", stars }
const state = { delivery: { ...DEFAULT_DELIVERY }, ticketCounter: {}, panelMessages: {}, reviews: {}, ...loadState() };
function saveState() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
const panelRef = (name) => state.panelMessages[name] ?? CONFIG.panelMessages[name];

/* ---------- Banner & Kacheln ----------------------------------------------
 * Banner: bot/admin/banners/<name>.png (sonst das Banner der alten Panel-Nachricht).
 * Kachel rechts: bot/admin/banners/thumbs/<datei>.
 */
const bannerUrlCache = {};

async function banner(name) {
  const file = path.join(DIR, "banners", `${name}.png`);
  if (existsSync(file)) {
    return { url: `attachment://${name}.png`, files: [new AttachmentBuilder(file, { name: `${name}.png` })] };
  }
  if (!bannerUrlCache[name]) {
    try {
      const ref = panelRef(name);
      const msg = await (await client.channels.fetch(ref.channelId)).messages.fetch(ref.messageId);
      const gallery = msg.components[0]?.components?.find((c) => c.type === 12);
      bannerUrlCache[name] = gallery?.items?.[0]?.media?.url ?? null;
    } catch (e) {
      console.warn(`Banner für "${name}" nicht gefunden:`, e.message);
    }
  }
  return { url: bannerUrlCache[name] ?? null, files: [] };
}

const THUMBS = {
  ticket: "thumb_ticket.png",
  verify: "thumb_shield.png",
  legal: "thumb_legal.png",
  delivery: "thumb_liefer_grun.png",
  pricing: "thumb_bill.png",
  transcript: "thumb_doc.png",
};

function thumbAsset(name) {
  const file = THUMBS[name] && path.join(DIR, "banners", "thumbs", THUMBS[name]);
  return file && existsSync(file)
    ? { url: `attachment://${THUMBS[name]}`, files: [new AttachmentBuilder(file, { name: THUMBS[name] })] }
    : { url: null, files: [] };
}

/* ---------- Panels posten / aktualisieren ---------------------------------- */

const PANELS = {
  ticket: (a) => V.ticketPanel(a),
  verify: (a) => V.verifyPanel(a),
  legal: (a) => V.legalPanel(a),
  delivery: (a) => V.deliveryPanel({ ...a, state: state.delivery }),
  pricing: (a) => V.pricingPanel(a),
};

/** Panel samt Banner und Kachel als Anhang */
async function renderPanel(name) {
  const b = await banner(name);
  const t = thumbAsset(name);
  return { components: [PANELS[name]({ banner: b.url, thumb: t.url })], files: [...b.files, ...t.files] };
}

async function postPanel(name, channel) {
  const msg = await channel.send({ ...(await renderPanel(name)), flags: V2 });
  state.panelMessages[name] = { channelId: channel.id, messageId: msg.id };
  saveState();
  return msg;
}

/** Bestehende Panel-Nachricht mit dem aktuellen Stand neu aufbauen */
async function editPanel(name, msg) {
  if (!msg) {
    const ref = panelRef(name);
    msg = await (await client.channels.fetch(ref.channelId)).messages.fetch(ref.messageId);
  }
  const r = await renderPanel(name);
  await msg.edit({
    components: r.components,
    ...(r.files.length ? { files: r.files, attachments: [] } : {}),
    flags: V2,
  });
}
const refreshDeliveryPanel = () => editPanel("delivery");

/** Texte, Emojis und Buttons einer Nachricht — Bilder bleiben außen vor */
function fingerprint(c, out = []) {
  if (c.type === 12) return out;
  if (c.content) out.push(c.content);
  for (const k of ["custom_id", "label", "placeholder", "style"]) if (c[k] !== undefined) out.push(`${k}=${c[k]}`);
  if (c.emoji) out.push(`emoji=${c.emoji.id ?? c.emoji.name}`);
  for (const o of c.options ?? []) out.push(`option=${o.value}|${o.label}|${o.description}|${o.emoji?.id ?? o.emoji?.name}`);
  for (const x of c.components ?? []) fingerprint(x, out);
  if (c.accessory) fingerprint(c.accessory, out);
  return out;
}

/** Beim Start: Panels im Server an den Code angleichen (nur geänderte werden bearbeitet) */
async function syncPanels() {
  for (const name of Object.keys(PANELS)) {
    try {
      const ref = panelRef(name);
      const msg = await (await client.channels.fetch(ref.channelId)).messages.fetch(ref.messageId);
      const live = fingerprint(msg.components[0].toJSON()).join("\n");
      const wanted = fingerprint(PANELS[name]({ banner: null, thumb: null })).join("\n");
      if (live === wanted) continue;
      await editPanel(name, msg);
      console.log(`Panel "${name}" aktualisiert`);
    } catch (e) {
      console.warn(`Panel "${name}" nicht abgeglichen:`, e.message);
    }
  }
}

/* ---------- Tickets --------------------------------------------------------
 * Kanalthema "ticket|<typ>|<userId>|<nr>" — gleiches Format wie die
 * bestehenden Tickets (z. B. kauf-11).
 */
const parseTopic = (topic) => {
  const [tag, type, userId, nr] = (topic ?? "").split("|");
  return tag === "ticket" ? { type, userId, nr: Number(nr) } : null;
};

function nextTicketNumber(guild, type) {
  let max = state.ticketCounter[type] ?? 0;
  for (const c of guild.channels.cache.values()) {
    const t = parseTopic(c.topic);
    if (t?.type === type && t.nr > max) max = t.nr;
  }
  state.ticketCounter[type] = max + 1;
  saveState();
  return max + 1;
}

async function openTicket(i, type) {
  const t = V.TICKET_TYPES[type];
  if (!t) return;
  const existing = i.guild.channels.cache.find((c) => {
    const tp = parseTopic(c.topic);
    return tp?.type === type && tp.userId === i.user.id;
  });
  if (existing) {
    return i.reply({ content: `${B.info} Du hast bereits ein offenes ${t.de}-Ticket: <#${existing.id}>`, flags: MessageFlags.Ephemeral });
  }

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const nr = nextTicketNumber(i.guild, type);
  const F = PermissionFlagsBits;
  const member = [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.AttachFiles, F.ReadMessageHistory];
  const channel = await i.guild.channels.create({
    name: `${type}-${nr}`,
    type: ChannelType.GuildText,
    parent: CONFIG.ticketCategories[type],
    topic: `ticket|${type}|${i.user.id}|${nr}`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [F.ViewChannel] },
      { id: i.user.id, allow: member },
      { id: CONFIG.roles.team, allow: [...member, F.ManageMessages] },
      { id: client.user.id, allow: [...member, F.ManageChannels] },
    ],
  });

  await channel.send({
    content: `<@${i.user.id}> <@&${CONFIG.roles.team}>`,
    allowedMentions: { users: [i.user.id], roles: [CONFIG.roles.team] },
  });
  const b = await banner("ticket");
  await channel.send({
    components: [V.ticketWelcome({ type, banner: b.url, avatar: avatarOf(i.user) })],
    files: b.files,
    flags: V2,
  });
  await i.editReply({ content: `${B.tick} Dein Ticket wurde erstellt: <#${channel.id}>` });
}

/* ---------- Transcripts --------------------------------------------------------
 * Beim Schließen: kompletter Verlauf inkl. aller Dateien wird archiviert
 * (transcript.mjs) und als Link in den Log-Kanal + per DM an den Kunden geschickt.
 */
const closing = new Set(); // Kanäle, die gerade geschlossen werden (gegen Doppelklicks)

async function deliverTranscript(tr, ticket, closer, channelName) {
  const meta = { channelName, type: ticket.type, nr: ticket.nr, ownerId: ticket.userId, closedById: closer.id, closedAt: Date.now(), ...tr.stats };
  const fileName = `transcript-${channelName.replace(/[^A-Za-z0-9_-]/g, "_")}.html`;
  const message = (forOwner) => {
    const t = thumbAsset("transcript");
    const files = [...t.files];
    if (tr.lightHtml) files.push(new AttachmentBuilder(tr.lightHtml, { name: fileName }));
    return {
      components: [V.transcriptCard({ meta, url: tr.url, forOwner, thumb: t.url, file: tr.lightHtml ? `attachment://${fileName}` : null })],
      files,
      flags: V2,
      allowedMentions: { parse: [] },
    };
  };
  try {
    const log = await client.channels.fetch(CONFIG.channels.transcripts);
    await log.send(message(false));
  } catch (e) {
    console.error("Transcript in Log-Kanal:", e.message);
  }
  try {
    const owner = await client.users.fetch(ticket.userId);
    await owner.send(message(true));
  } catch (e) {
    // z. B. Kunde hat DMs vom Server deaktiviert
    console.warn(`Transcript-DM an ${ticket.userId} nicht zustellbar:`, e.message);
  }
}

/* ---------- Bewertungen (nur Kauf-Tickets) ------------------------------------ */

async function sendReviewPrompt(userId, nr) {
  if (state.reviews[nr]?.status === "done") return;
  try {
    const user = await client.users.fetch(userId);
    const b = await banner("review");
    await user.send({ components: [V.reviewPrompt({ banner: b.url, nr })], files: b.files, flags: V2 });
    state.reviews[nr] = { userId, status: "pending" };
    saveState();
  } catch (e) {
    // z. B. Kunde hat DMs vom Server deaktiviert
    console.warn(`Bewertungsanfrage für Ticket #${nr} nicht zustellbar:`, e.message);
  }
}

function reviewModal(nr, stars) {
  return new ModalBuilder()
    .setCustomId(`gevo:review_modal:${nr}:${stars}`)
    .setTitle(`Bewertung – ${stars} von 5 Sternen`)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("feedback")
        .setLabel("Dein Feedback")
        .setPlaceholder("Was hat dir gefallen? Was können wir besser machen?")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ));
}

/** Prüft, ob dieser Nutzer dieses Ticket noch bewerten darf */
function reviewAllowed(nr, userId) {
  const r = state.reviews[nr];
  if (!r || r.userId !== userId) return "Diese Bewertung gehört nicht zu deinem Ticket.";
  if (r.status === "done") return "Dieses Ticket hast du bereits bewertet – danke!";
  return null;
}

async function onReviewSubmit(i) {
  const [, , nr, starsRaw] = i.customId.split(":");
  const stars = Math.min(5, Math.max(1, Number(starsRaw)));
  const denied = reviewAllowed(nr, i.user.id);
  if (denied) return i.reply({ content: `${B.info} ${denied}`, flags: MessageFlags.Ephemeral });

  const feedback = i.fields.getTextInputValue("feedback");
  const channel = await client.channels.fetch(CONFIG.channels.feedback);
  const b = await banner("review");
  await channel.send({
    components: [V.review({ banner: b.url, avatar: avatarOf(i.user), userId: i.user.id, nr, stars, feedback })],
    files: b.files,
    flags: V2,
    allowedMentions: { users: [i.user.id] },
  });
  state.reviews[nr] = { userId: i.user.id, status: "done", stars };
  saveState();

  // Die DM mit den Sterne-Buttons wird durch das Dankeschön ersetzt
  if (i.isFromMessage()) {
    await i.update({ components: [V.reviewThanks(stars)], attachments: [], flags: V2 });
  } else {
    await i.reply({ components: [V.reviewThanks(stars)], flags: PRIVATE });
  }
}

/* ---------- Interaktionen --------------------------------------------------- */

async function onButton(i) {
  const id = i.customId;

  if (id === "gevo:verify") {
    const role = CONFIG.roles.member;
    if (i.member.roles.cache.has(role)) {
      return i.reply({ content: `${B.tick} Du bist bereits verifiziert.`, flags: MessageFlags.Ephemeral });
    }
    try {
      await i.member.roles.add(role, "Verifiziert über den Button");
      return i.reply({ content: `${B.tick} Du bist jetzt verifiziert – willkommen bei **Gevo Studio**!`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error("Verifizieren fehlgeschlagen:", e.message);
      return i.reply({ content: `${B.warn} Verifizierung gerade nicht möglich. Bitte melde dich im <#${CONFIG.channels.ticket}>.`, flags: MessageFlags.Ephemeral });
    }
  }

  if (id.startsWith("gevo:ticket_open:")) return openTicket(i, id.slice("gevo:ticket_open:".length));

  if (id === "gevo:ticket_close") {
    if (!parseTopic(i.channel?.topic)) {
      return i.reply({ content: `${B.warn} Das ist kein Ticket-Kanal.`, flags: MessageFlags.Ephemeral });
    }
    return i.reply({ components: [V.ticketCloseConfirm()], flags: PRIVATE });
  }
  if (id === "gevo:ticket_close_cancel") {
    return i.update({ components: [V.notice(B.tick, "Ticket bleibt offen.")], flags: V2 });
  }
  if (id === "gevo:ticket_close_confirm") {
    const ticket = parseTopic(i.channel?.topic);
    if (!ticket) return;
    if (closing.has(i.channel.id)) {
      return i.update({ components: [V.notice(B.info, "Das Ticket wird bereits geschlossen …")], flags: V2 });
    }
    closing.add(i.channel.id);
    await i.update({ components: [V.notice(B.t_doc, "Transcript wird erstellt – alle Nachrichten, Bilder und Dateien werden gespeichert …")], flags: V2 });
    await i.channel.send({ content: `${B.lock} Ticket geschlossen von <@${i.user.id}>.`, allowedMentions: { users: [] } });

    // Erst wenn das Transcript sicher gespeichert ist, wird der Kanal gelöscht
    let tr;
    try {
      tr = await createTranscript({
        api: discordApi(TOKEN),
        guildId: CONFIG.guildId,
        channelId: i.channel.id,
        ticket: { type: ticket.type, nr: ticket.nr, ownerId: ticket.userId },
        closedById: i.user.id,
        outDir: CONFIG.transcripts.dir,
        baseUrl: CONFIG.transcripts.baseUrl,
        typeLabels: Object.fromEntries(Object.entries(V.TICKET_TYPES).map(([k, v]) => [k, v.de])),
      });
      console.log(`Transcript ${i.channel.name}: ${tr.url} (${tr.stats.messages} Nachrichten, ${tr.stats.files} Dateien)`);
    } catch (e) {
      closing.delete(i.channel.id);
      console.error(`Transcript für ${i.channel.name} fehlgeschlagen:`, e);
      return i.editReply({ components: [V.notice(B.warn, "Das Transcript konnte nicht erstellt werden – das Ticket bleibt offen. Bitte versuch es gleich noch einmal.")], flags: V2 });
    }

    await deliverTranscript(tr, ticket, i.user, i.channel.name);
    await i.editReply({ components: [V.notice(B.lock, "Transcript gespeichert – das Ticket wird in 5 Sekunden geschlossen …")], flags: V2 });
    // Nur bei Bestellungen: Kunde bekommt per DM die Bitte um eine Bewertung
    if (ticket.type === "kauf") await sendReviewPrompt(ticket.userId, ticket.nr);
    const channel = i.channel;
    setTimeout(() => channel.delete(`Ticket geschlossen von ${i.user.tag}`)
      .catch((e) => console.error("Ticket löschen:", e.message))
      .finally(() => closing.delete(channel.id)), 5000);
    return;
  }

  if (id.startsWith("gevo:legal:")) {
    const detail = V.legalDetail(id.slice("gevo:legal:".length));
    if (detail) return i.reply({ components: [detail], flags: PRIVATE });
  }

  if (id.startsWith("gevo:tr:")) {
    const which = id.slice("gevo:tr:".length);
    const en = {
      tickets_panel: () => V.ticketPanel({ lang: "en" }),
      verify: () => V.verifyPanel({ lang: "en" }),
      legal: () => V.legalPanel({ lang: "en" }),
      delivery: () => V.deliveryPanel({ state: state.delivery, lang: "en" }),
      pricing_main: () => V.pricingPanel({ lang: "en" }),
      ticket: () => V.ticketWelcome({ type: parseTopic(i.channel?.topic)?.type ?? "support", lang: "en" }),
    }[which];
    if (en) return i.reply({ components: [en()], flags: PRIVATE });
  }

  if (id.startsWith("gevo:review:")) {
    const [, , nr, stars] = id.split(":");
    const denied = reviewAllowed(nr, i.user.id);
    if (denied) return i.reply({ content: `${B.info} ${denied}`, flags: MessageFlags.Ephemeral });
    return i.showModal(reviewModal(nr, stars));
  }

  if (id.startsWith("gevo:price_")) {
    const detail = V.priceDetail(id.slice("gevo:".length));
    if (detail) return i.reply({ components: [detail], flags: PRIVATE });
  }

  // Buttons aus alten Vorschau-Nachrichten (/vorschau gibt es nicht mehr)
  if (id.startsWith("gevo:preview:")) {
    return i.reply({ content: `${B.info} Das neue Design ist jetzt live – nutze bitte die Buttons in den Panels.`, flags: MessageFlags.Ephemeral });
  }
}

/** Auswahlmenüs aus älteren Nachrichten */
async function onSelect(i) {
  const value = i.values[0];
  if (i.customId === "gevo:ticket_select") return openTicket(i, value);
  if (i.customId === "gevo:legal_select") {
    const detail = V.legalDetail(value);
    if (detail) return i.reply({ components: [detail], flags: PRIVATE });
  }
}

/* ---------- Slash-Commands -------------------------------------------------- */

const commands = [
  new SlashCommandBuilder()
    .setName("lieferzeit")
    .setDescription("Lieferzeit-Panel aktualisieren")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("stufe").setDescription("Aktuelle Lieferzeit")
        .addChoices(...DELIVERY_LEVELS.map((l) => ({ name: l.label, value: l.key }))))
    .addIntegerOption((o) => o.setName("offene").setDescription("Offene Bestellungen").setMinValue(0))
    .addIntegerOption((o) => o.setName("fast_slots").setDescription("Freie Fast Delivery Slots").setMinValue(0))
    .addBooleanOption((o) => o.setName("bevorzugt").setDescription("Bevorzugte Bearbeitung verfügbar?"))
    .addBooleanOption((o) => o.setName("next_day").setDescription("Next Day Delivery verfügbar?")),
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Ein Panel in diesem Kanal neu posten")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("typ").setDescription("Welches Panel?").setRequired(true).addChoices(
        { name: "Ticket-System", value: "ticket" },
        { name: "Verifizieren", value: "verify" },
        { name: "Rechtliches", value: "legal" },
        { name: "Lieferzeit", value: "delivery" },
        { name: "Preisliste", value: "pricing" },
      )),
].map((c) => c.toJSON());

async function onCommand(i) {
  if (i.commandName === "lieferzeit") {
    const d = state.delivery;
    const stufe = i.options.getString("stufe");
    const offene = i.options.getInteger("offene");
    const slots = i.options.getInteger("fast_slots");
    const bevorzugt = i.options.getBoolean("bevorzugt");
    const nextDay = i.options.getBoolean("next_day");
    if (stufe !== null) d.level = stufe;
    if (offene !== null) d.open = offene;
    if (slots !== null) d.fastSlots = slots;
    if (bevorzugt !== null) d.priority = bevorzugt;
    if (nextDay !== null) d.nextDay = nextDay;
    saveState();

    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await refreshDeliveryPanel();
      const lvl = DELIVERY_LEVELS.find((l) => l.key === d.level);
      return i.editReply(
        `${B.tick} Lieferzeit aktualisiert: **${lvl.label}** · ${d.open} offen · ${d.fastSlots} Fast Slots · ` +
        `Bevorzugt ${d.priority ? "an" : "aus"} · Next Day ${d.nextDay ? "an" : "aus"}`);
    } catch (e) {
      console.error("Lieferzeit-Panel:", e.message);
      return i.editReply(`${B.warn} Panel nicht gefunden. Poste es mit \`/panel typ:Lieferzeit\` neu.`);
    }
  }

  if (i.commandName === "panel") {
    const typ = i.options.getString("typ");
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await postPanel(typ, i.channel);
    return i.editReply(`${B.tick} Panel gepostet.`);
  }
}

/* ---------- Client ------------------------------------------------------------ */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ${c.user.tag} online`);
  const rest = new REST().setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId), { body: commands });
  console.log("Slash-Commands /lieferzeit + /panel registriert");
  await syncPanels();
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== CONFIG.guildId || member.user.bot) return;
  try {
    const channel = await client.channels.fetch(CONFIG.channels.welcome);
    const b = await banner("welcome");
    await channel.send({
      components: [V.welcome({ banner: b.url, avatar: avatarOf(member.user), userId: member.id })],
      files: b.files,
      flags: V2,
      allowedMentions: { users: [member.id] },
    });
  } catch (e) {
    console.error("Willkommensnachricht:", e.message);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) await onCommand(i);
    else if (i.isButton()) await onButton(i);
    else if (i.isStringSelectMenu()) await onSelect(i);
    else if (i.isModalSubmit() && i.customId.startsWith("gevo:review_modal:")) await onReviewSubmit(i);
  } catch (e) {
    console.error(`Interaktion ${i.customId ?? i.commandName}:`, e);
    const msg = { content: `${B.warn} Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.`, flags: MessageFlags.Ephemeral };
    if (i.deferred || i.replied) await i.editReply(msg).catch(() => {});
    else await i.reply(msg).catch(() => {});
  }
});

client.on(Events.Error, (e) => console.error("Discord-Client:", e));
client.login(TOKEN);
