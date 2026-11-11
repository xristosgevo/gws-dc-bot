/**
 * Panels von "GWS | Administration" als rohes Components-V2-JSON.
 * Die deutschen Texte sind 1:1 aus den bestehenden Server-Nachrichten übernommen;
 * "en" ist die Fassung für die translate-Buttons.
 */
import { CONFIG } from "./config.mjs";

export const ACCENT = 2039844;

export const E = {
  ticket: "<:GWS_Ticket:1567670403353018482>", // Bot-Emoji (Server-Emoji inaktiv)
  contact: "<:GWS_contact:1517087117443072120>",
  cart: "<:GWS_shoppingcart:1567670405840248953>", // Bot-Emoji (Server-Emoji inaktiv)
  partner: "<:GWS_partner:1517088858855047208>",
  boss: "<:GWS_Geschaftsfuhrung:1517087642825654464>",
  doc: "<:GWS_Document:1517087291036795100>",
  stop: "<:GWS_stop:1567670408256168169>", // Bot-Emoji (Server-Emoji inaktiv)
  legal: "<:GWS_Rechtliches:1517089170101637170>",
  down: "<:GWS_down:1517087345797632042>",
  right: "<:GWS_right:1517089376650137721>",
  left: "<:GWS_left:1517088011710627930>",
  lock: "<:GWS_Lock:1517088551500779631>",
  star: "<:GWS_Stern:1567670410453979269>", // Bot-Emoji (Server-Emoji inaktiv)
  design: "<:GWS_Design:1517087206404264036>",
  code: "<:GWS_code:1517087040687308901>",
  shield: "<:GWS_shield:1517089490408177714>",
  info: "<:GWS_Info:1517087889811574804>",
  mollie: "<:GWS_mollie_pay:1517088688415182868>",
  // Bot-eigenes Emoji (Server ist beim Emoji-Limit) — Stil wie GWS_mollie_pay
  stripe: "<:GWS_stripe_pay:1567669741047521341>",
  stats: "<:GWS_Stats:1567670412899520713>", // Bot-Emoji (Server-Emoji inaktiv)
  list: "<:GWS_list:1517088456746991636>",
  fast: "<:GWS_FastDelivery:1517087388893970512>",
  nextday: "<:GWS_nextdaydelivery:1517088751669612604>",
  truck: "<:GWS_Lieferzeit:1517088265482801222>",
  tick: "<:GWS_tick:1517086727058227270>",
  x: "<:GWS_X:1567670417391624293>", // Bot-Emoji (Server-Emoji inaktiv)
  warn: "<:gws_Warning:1567670419274866720>", // Bot-Emoji (Server-Emoji inaktiv)
  bill: "<:GWS_bill:1517086863288963163>",
  server: "<:GWS_Server:1517089433784946738>",
  gift: "<:GWS_Gift:1517087691651416105>",
  people: "<:GWS_People:1517088909555667024>",
  view: "<:GWS_view:1567670421602705410>", // Bot-Emoji (Server-Emoji inaktiv)
  link: "<:GWS_Link:1517088389839720478>",
  english: "<:englisch:1567670423938793535>", // Bot-Emoji (Server-Emoji inaktiv)
  winner: "<:GWS_Winner:1567670426904305706>", // Bot-Emoji (Server-Emoji inaktiv)
  feedback: "<:GWS_feedback:1517087429482381312>",
  green: "<:GWS_liefer_grun:1517088072754528266>",
  yellow: "<:GWS_liefer_gelb:1517088120145838211>",
  orange: "<:GWS_liefer_orange:1517088186151604314>",
  red: "<:GWS_Liefer_rot:1517088225074745444>",
};

const FOOTER = "-# Gevo Studio © • Premium Design & Development";

/* ---------- Bausteine ---------------------------------------------------- */

/** "<:name:id>" / "<a:name:id>" → { name, id, animated } für Button-/Menü-Emojis */
const emo = (s) => {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(s);
  if (!m) return { name: s };
  return m[1] ? { name: m[2], id: m[3], animated: true } : { name: m[2], id: m[3] };
};
const text = (content) => ({ type: 10, content });
const sep = () => ({ type: 14, divider: true, spacing: 1 });
const row = (...components) => ({ type: 1, components });
const media = (url) => ({ type: 12, items: [{ media: { url } }] });
const button = (style, label, emoji, custom_id) => ({ type: 2, style, label, emoji: emo(emoji), custom_id });
const linkButton = (label, emoji, url) => ({ type: 2, style: 5, label, emoji: emo(emoji), url });
const section = (content, accessory) => ({ type: 9, components: [text(content)], accessory });
const container = (components) => ({ type: 17, accent_color: ACCENT, components: components.filter(Boolean) });
const translate = (id) => row(button(2, "translate", E.english, `gevo:tr:${id}`));
const ch = (id) => `<#${CONFIG.channels[id]}>`;

/** Bausteine für panels-v2.mjs (neues Design) */
export const UI = { emo, text, sep, row, media, button, linkButton, section, container, ch, FOOTER };

/* ---------- Ticket-System ------------------------------------------------- */

export const TICKET_TYPES = {
  support: { de: "Support", en: "Support", emoji: E.contact,
    desc: { de: "Allgemeine Hilfe, Fragen und Projekt-Updates", en: "General help, questions and project updates" } },
  kauf: { de: "Kauf", en: "Purchase", emoji: E.cart,
    desc: { de: "Erwerb von Produkten oder Einreichen von Aufträgen", en: "Buying products or placing orders" } },
  partner: { de: "Partner", en: "Partner", emoji: E.partner,
    desc: { de: "Anfragen für geschäftliche Partnerschaften", en: "Requests for business partnerships" } },
  geschaeftsfuehrung: { de: "Geschäftsführung", en: "Management", emoji: E.boss,
    desc: { de: "Direkter Kontakt zur Studio-Leitung", en: "Direct contact with studio management" } },
};

export function ticketPanel(lang, banner) {
  const de = lang === "de";
  const T = TICKET_TYPES;
  const body = de
    ? `- ${E.ticket} **Service- & Support-Zentrale**

> Willkommen beim offiziellen Ticketsystem von **Gevo Studio©**. Egal ob Auftrag, Hilfe oder Kooperation – hier bist du richtig.

**Wähle unten die passende Kategorie:**
- ${E.contact} **Support** · Allgemeine Hilfe, Fragen und Projekt-Updates.
- ${E.cart} **Kauf** · Erwerb von Produkten oder Einreichen von Aufträgen.
- ${E.partner} **Partner** · Anfragen für geschäftliche Partnerschaften.
- ${E.boss} **Geschäftsführung** · Direkter Kontakt zur Studio-Leitung.

> ${E.doc} Beschreibe dein Anliegen direkt nach der Eröffnung so detailliert wie möglich.
> ${E.stop} Bitte sieh vom Pingen der Teammitglieder ab.
> ${E.legal} Unsere AGB und Richtlinien gelten auch im Ticket-Bereich.
${E.down} **Wähle unten eine Kategorie**
${FOOTER}`
    : `- ${E.ticket} **Service & Support Center**

> Welcome to the official ticket system of **Gevo Studio©**. Whether it's an order, help or a collaboration – you're in the right place.

**Choose the matching category below:**
- ${E.contact} **Support** · General help, questions and project updates.
- ${E.cart} **Purchase** · Buying products or placing orders.
- ${E.partner} **Partner** · Requests for business partnerships.
- ${E.boss} **Management** · Direct contact with studio management.

> ${E.doc} Describe your request in as much detail as possible right after opening.
> ${E.stop} Please don't ping individual team members.
> ${E.legal} Our terms and guidelines also apply in the ticket area.
${E.down} **Choose a category below**
${FOOTER}`;

  return container([
    banner && media(banner),
    text(body),
    sep(),
    row({
      type: 3,
      custom_id: "gevo:ticket_select",
      placeholder: de ? "🎫 Wähle eine Kategorie …" : "🎫 Choose a category …",
      options: Object.entries(T).map(([value, t]) => ({
        label: t[lang], description: t.desc[lang], value, emoji: emo(t.emoji),
      })),
    }),
    de && translate("tickets_panel"),
  ]);
}

export function ticketWelcome(type, lang, banner) {
  const t = TICKET_TYPES[type];
  const body = lang === "de"
    ? `- ${t.emoji} **Ticket – ${t.de}**

> Willkommen in deinem **${t.de}**-Ticket!

- ${E.right} Beschreibe dein Anliegen **so detailliert wie möglich**.
- ${E.contact} Ein Teammitglied meldet sich schnellstmöglich bei dir.
- ${E.stop} Bitte sieh vom Pingen einzelner Teammitglieder ab.
- ${E.legal} Es gelten unsere AGB und Richtlinien.

${E.lock} **Geklärt? Schließe das Ticket über den Button unten.**
${FOOTER}`
    : `- ${t.emoji} **Ticket – ${t.en}**

> Welcome to your **${t.en}** ticket!

- ${E.right} Describe your request **in as much detail as possible**.
- ${E.contact} A team member will get back to you as soon as possible.
- ${E.stop} Please don't ping individual team members.
- ${E.legal} Our terms and guidelines apply.

${E.lock} **Resolved? Close the ticket with the button below.**
${FOOTER}`;

  return container([
    banner && media(banner),
    text(body),
    sep(),
    row(button(4, lang === "de" ? "Ticket schließen" : "Close ticket", E.lock, "gevo:ticket_close")),
    lang === "de" && translate("ticket"),
  ]);
}

export function ticketCloseConfirm() {
  return container([
    text(`${E.lock} **Ticket wirklich schließen?**\nDer Kanal wird danach gelöscht.`),
    row(
      button(4, "Ja, schließen", E.lock, "gevo:ticket_close_confirm"),
      button(2, "Abbrechen", E.left, "gevo:ticket_close_cancel"),
    ),
  ]);
}

/* ---------- Bewertung nach Kauf-Tickets ------------------------------------ */

/** Private Nachricht an den Kunden, nachdem sein Kauf-Ticket geschlossen wurde */
export function reviewPrompt(nr, banner) {
  return container([
    banner && media(banner),
    text(`- ${E.winner} **Wie zufrieden warst du?**
> Dein Kauf-Ticket #${nr} bei **Gevo Studio** wurde geschlossen. Bewerte uns mit 1 bis 5 Sternen – deine Bewertung erscheint in ${ch("feedback")}.
${FOOTER}`),
    sep(),
    row(...[1, 2, 3, 4, 5].map((n) => button(2, String(n), E.star, `gevo:review:${nr}:${n}`))),
  ]);
}

export function reviewThanks(stars) {
  return container([
    text(`- ${E.tick} **Danke für deine Bewertung!**
> ${E.star.repeat(stars)}  (${stars}/5) – dein Feedback ist jetzt in ${ch("feedback")} zu sehen.
${FOOTER}`),
  ]);
}

/** Bewertung in #feedback — Format wie die bestehenden Bewertungen */
export function reviewPost({ userId, nr, stars, feedback }, banner) {
  const quoted = feedback.trim().split(/\r?\n/).map((l) => `> ${l}`).join("\n");
  return container([
    banner && media(banner),
    text(`- ${E.winner} **Neue Bewertung von <@${userId}>**
> Ticket #${nr}

- ${E.winner} **Bewertung**
> ${E.star.repeat(stars)}  (${stars}/5)
- ${E.feedback} **Feedback des Kunden**
${quoted}
${FOOTER}`),
  ]);
}

/* ---------- Willkommen ---------------------------------------------------- */

export function welcome(userId, banner) {
  return container([
    banner && media(banner),
    text(`- ${E.star} **Willkommen bei Gevo Studio!**

> Schön, dass du den Weg zu uns gefunden hast, <@${userId}>!

- ${E.design} **UI/UX Design** & ${E.code} **Fullstack Entwicklung**
> Erstklassige, maßgeschneiderte Lösungen – genau hier richtig.
- ${E.ticket} **Projekt starten**
> Eröffne einfach ein ${ch("ticket")}.
- ${E.shield} **Verifizierung**
> Bitte verifiziere dich unter ${ch("verify")} – damit akzeptierst du unsere Nutzungsbedingungen (jederzeit in ${ch("legal")} einsehbar).

${E.right} *Wir freuen uns auf dein Projekt.*
${FOOTER}`),
  ]);
}

/* ---------- Verifizieren -------------------------------------------------- */

export function verifyPanel(lang, banner) {
  const de = lang === "de";
  const body = de
    ? `- ${E.shield} **Verifizierung**

> ${E.info} Halte dich stets an die Discord TOS: https://discord.com/terms, sowie an die Discord Community-Richtlinien: https://discord.com/guidelines.

Bitte lies dir unsere Bedingungen aufmerksam durch. Mit dem Klick auf den Button akzeptierst du unsere Hausregeln.
- ${E.stripe} **Zahlung & Abwicklung**
> Wir arbeiten ausschließlich mit Vorkasse, um Ressourcen optimal zu planen.
- ${E.code} **Leistungen & Tools**
> Wir liefern maßgeschneiderte UI- und Fullstack Development Lösungen (UI, Frontend, Backend).
- ${E.contact} **Revisionen & Support**
> Fehlerbehebungen sind kostenlos. Design-Änderungen sind bis zu einem gewissen Grad inklusive.
- ${E.lock} **Datenschutz & Urheberrecht**
> Die Weitergabe von Dateien oder Chatverläufen an Dritte ist streng untersagt.

${E.legal} Weitere Informationen findest du unter ${ch("legal")}.
${E.down} **Klicke hier um zu Verifizieren**
${FOOTER}`
    : `- ${E.shield} **Verification**

> ${E.info} Always follow the Discord ToS: https://discord.com/terms, as well as the Discord Community Guidelines: https://discord.com/guidelines.

Please read our terms carefully. By clicking the button you accept our house rules.
- ${E.stripe} **Payment & Processing**
> We work with advance payment only, so we can plan resources optimally.
- ${E.code} **Services & Tools**
> We deliver custom UI and full-stack development solutions (UI, frontend, backend).
- ${E.contact} **Revisions & Support**
> Bug fixes are free. Design changes are included up to a certain extent.
- ${E.lock} **Privacy & Copyright**
> Sharing files or chat logs with third parties is strictly prohibited.

${E.legal} You can find more information in ${ch("legal")}.
${E.down} **Click here to verify**
${FOOTER}`;

  return container([
    banner && media(banner),
    text(body),
    sep(),
    row(button(3, de ? "Verifizieren" : "Verify", E.tick, "gevo:verify")),
    de && translate("verify"),
  ]);
}

/* ---------- Rechtliches ---------------------------------------------------- */

const LEGAL = {
  impressum: { emoji: E.doc, path: "/impressum",
    de: ["Impressum", "Angaben gemäß § 5 DDG"], en: ["Legal notice", "Information according to § 5 DDG"] },
  datenschutz: { emoji: E.lock, path: "/datenschutz",
    de: ["Datenschutz", "Umgang mit deinen Daten"], en: ["Privacy", "How we handle your data"] },
  agb: { emoji: E.legal, path: "/agb",
    de: ["AGB", "Allgemeine Geschäftsbedingungen"], en: ["Terms", "General terms and conditions"] },
  widerruf: { emoji: E.left, path: "/widerruf",
    de: ["Widerruf", "Widerrufsbelehrung"], en: ["Withdrawal", "Right of withdrawal"] },
};

export function legalPanel(lang, banner) {
  const de = lang === "de";
  const list = Object.values(LEGAL).map((l) => `- ${l.emoji} **${l[lang][0]}** · ${l[lang][1]}`).join("\n");
  const body = de
    ? `- ${E.legal} **Rechtliches & Transparenz**

> Hier findest du alle rechtlichen Informationen zu **Gevo Studio**. Wähle im Menü unten den gewünschten Bereich – die Details werden dir privat angezeigt.

${list}
${E.down} **Wähle unten einen Bereich**
${FOOTER}`
    : `- ${E.legal} **Legal & Transparency**

> Here you'll find all legal information about **Gevo Studio**. Choose an area in the menu below – the details are shown to you privately.

${list}
${E.down} **Choose an area below**
${FOOTER}`;

  return container([
    banner && media(banner),
    text(body),
    sep(),
    row({
      type: 3,
      custom_id: "gevo:legal_select",
      placeholder: de ? "📑 Wähle einen rechtlichen Bereich …" : "📑 Choose a legal area …",
      options: Object.entries(LEGAL).map(([value, l]) => ({
        label: l[lang][0], description: l[lang][1], value, emoji: emo(l.emoji),
      })),
    }),
    de && translate("legal"),
  ]);
}

/** Private Antwort auf die Auswahl im Rechtliches-Menü */
export function legalDetail(key) {
  const l = LEGAL[key];
  if (!l) return null;
  const bodies = {
    impressum: `## ${E.doc} Impressum
-# Angaben gemäß § 5 DDG

**Karen Gevorgyan**
Gevo Web Studio
Weg Am Sportplatz 13b
22850 Norderstedt

**Kontakt**
> Telefon: +49 176 67494606
> E-Mail: gevo.web.studio@gmail.com

**Umsatzsteuer**
> Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.`,
    datenschutz: `## ${E.lock} Datenschutz
> Wie wir deine Daten erheben, verarbeiten und schützen – etwa bei Bestellungen, Zahlungen über Stripe und im Discord – steht in unserer Datenschutzerklärung.`,
    agb: `## ${E.legal} AGB
> Unsere Allgemeinen Geschäftsbedingungen regeln Angebote, Vertragsschluss, Zahlung (Vorkasse), Lieferung, Revisionen und Nutzungsrechte für alle Aufträge bei Gevo Studio.`,
    widerruf: `## ${E.left} Widerruf
> Wie und bis wann du einen Vertrag widerrufen kannst – und wann das Widerrufsrecht bei digitalen Leistungen vorzeitig erlischt – steht in unserer Widerrufsbelehrung.`,
  };
  return container([
    text(`${bodies[key]}\n${FOOTER}`),
    row(linkButton(`${l.de[0]} auf der Website`, E.link, `${CONFIG.website}${l.path}`)),
  ]);
}

/* ---------- Lieferzeit ---------------------------------------------------- */

export const DELIVERY_LEVELS = [
  { key: "3-5", emoji: E.green, label: "3-5 Werktage", en: "3-5 business days" },
  { key: "6-10", emoji: E.yellow, label: "6-10 Werktage", en: "6-10 business days" },
  { key: "11-20", emoji: E.orange, label: "11-20 Werktage", en: "11-20 business days" },
  { key: "21+", emoji: E.red, label: "ab 21 Werktage", en: "21+ business days" },
];

export const DEFAULT_DELIVERY = { level: "3-5", open: 4, fastSlots: 2, priority: true, nextDay: true };

export function deliveryPanel(state, lang, banner) {
  const s = { ...DEFAULT_DELIVERY, ...state };
  const cur = DELIVERY_LEVELS.find((l) => l.key === s.level) ?? DELIVERY_LEVELS[0];
  const de = lang === "de";
  const ok = (b) => (b ? E.tick : E.x);
  const levels = DELIVERY_LEVELS.map((l) => {
    const line = `${l.emoji} » ${de ? l.label : l.en}`;
    return l.key === cur.key ? `**${line}**` : line;
  }).join("\n");
  const now = cur.key === "21+"
    ? (de ? `aktuell **${cur.label}**` : `currently **${cur.en}**`)
    : (de ? `aktuell ca. **${cur.label}**` : `currently approx. **${cur.en}**`);
  const openTxt = de
    ? `**${s.open}** offene Bestellung${s.open === 1 ? "" : "en"}`
    : `**${s.open}** open order${s.open === 1 ? "" : "s"}`;
  const slotTxt = `**${s.fastSlots}** Fast Delivery Slot${s.fastSlots === 1 ? "" : "s"}`;

  const body = de
    ? `- ${E.stats} **Aktuelle Lieferzeit:**
> ${cur.emoji} » ${now}
> ${E.list} » ${openTxt}
> ${E.fast} » ${slotTxt}

${levels}

## ${E.truck} Zusätzliche Lieferoptionen:
- ${E.fast} **Bevorzugte Bearbeitung:** ${ok(s.priority)}
> Beschleunigte Bearbeitung und Lieferung deiner Bestellung außerhalb der normalen Bestellwarteliste. Dafür +80% Aufschlag auf die Bestellung.
- ${E.nextday} **Next Day Delivery:** ${ok(s.nextDay)}
> Bearbeitung und Lieferung bis zum nächsten Werktag 23:59 Uhr, wenn die Bestellung vor 14:00 Uhr eingeht und bezahlt wird. Dafür +120% Aufschlag auf die Bestellung.

> ${E.info} Wir arbeiten Werktags (Montag bis Freitag | 08:00 – 18:00 Uhr).
> ${E.warn} Angegebene Lieferzeiten sind nicht verbindlich und können abweichen – sie dienen als Richtwert.
${FOOTER}`
    : `- ${E.stats} **Current delivery time:**
> ${cur.emoji} » ${now}
> ${E.list} » ${openTxt}
> ${E.fast} » ${slotTxt}

${levels}

## ${E.truck} Additional delivery options:
- ${E.fast} **Priority processing:** ${ok(s.priority)}
> Faster processing and delivery of your order outside the regular queue. +80% surcharge on the order.
- ${E.nextday} **Next Day Delivery:** ${ok(s.nextDay)}
> Processing and delivery by 23:59 on the next business day if the order is placed and paid before 14:00. +120% surcharge on the order.

> ${E.info} We work on business days (Monday to Friday | 08:00 – 18:00).
> ${E.warn} Delivery times are not binding and may vary – they are a guideline.
${FOOTER}`;

  return container([banner && media(banner), text(body), ...(de ? [sep(), translate("delivery")] : [])]);
}

/* ---------- Preisliste ---------------------------------------------------- */

/**
 * UI-Design-Preise pro Script. Frontend = UI + 20 %, Backend = UI − 20 %,
 * jeweils auf glatte Euro gerundet.
 */
export const UI_PRICES = [
  ["Inventory", 25], ["Banking", 25], ["Identity", 20], ["Character Creator", 30],
  ["Garage", 25], ["Loadingscreen", 20], ["Salty NUI", 7.5], ["Clothing Store", 25],
  ["Deathscreen", 15], ["Crafting", 30], ["Farming Script", 25], ["Fishing Script", 20],
  ["24/7 Market", 20], ["Cardealer", 25], ["Carrental", 20], ["Basic Job Center", 15],
  ["Radial Menu", 20], ["ESX Menu Default|List|Dialog", 15], ["Skill Mechanism", 7.5],
  ["Personal Menu", 15], ["Admin Menu", 35],
];
const scaled = (factor) => UI_PRICES.map(([n, p]) => [n, Math.round(p * factor)]);

/** Inhalte der "Details ansehen"-Buttons (prices: null → "Preis auf Anfrage") */
export const PRICE_ITEMS = {
  "price_detail:ui": { emoji: E.design, name: "UI Design", prices: UI_PRICES,
    text: "Modernes Interface-Design, das deinen Server sofort hochwertiger wirken lässt – vom HUD bis zum Shop, individuell auf dein Branding zugeschnitten.",
    en: ["UI Design", "Modern interface design that instantly makes your server look more premium – from HUD to shop, tailored to your branding."] },
  "price_detail:frontend": { emoji: E.code, name: "Frontend Development", prices: scaled(1.2),
    text: "Aus Design wird Funktion: Wir setzen dein Interface in sauberen, performanten Code um – responsiv, flüssig und startklar für den Live-Betrieb.",
    en: ["Frontend Development", "From design to function: we turn your interface into clean, performant code – responsive, smooth and ready for production."] },
  "price_detail:backend": { emoji: E.server, name: "Backend Development", prices: scaled(0.8),
    text: "Das stabile Fundament dahinter: durchdachte Logik, sichere Datenbanken und zuverlässige Schnittstellen, damit dein System auch unter Last performt.",
    en: ["Backend Development", "The solid foundation behind it: well-designed logic, secure databases and reliable APIs, so your system performs under load."] },
  "price_bundle:rp_core": { emoji: E.people, name: "Roleplay Core Paket",
    prices: [["UI", 150], ["UI+Frontend", 350], ["Full Script", 500]],
    text: "Die Essentials für jeden Roleplay-Server: Identity, HUD, Deathscreen & mehr.",
    en: ["Roleplay Core Bundle", "The essentials for every roleplay server: identity, HUD, death screen & more."] },
  "price_bundle:economy": { emoji: E.bill, name: "Economy Paket",
    prices: [["UI", 110], ["UI+Frontend", 200], ["Full Script", 320]],
    text: "Das komplette Wirtschaftssystem: Banking, Shop, Coin Shop & Scoreboard.",
    en: ["Economy Bundle", "The complete economy system: banking, shop, coin shop & scoreboard."] },
};

const priceLine = (prices) => prices.map(([n, p]) => `${n} (${p}€)`).join(" • ");

export function pricingPanel(lang, banner) {
  const de = lang === "de";
  const P = PRICE_ITEMS;
  const item = (key) => {
    const p = P[key];
    const [name, desc] = de ? [p.name, p.text] : p.en;
    const prices = key.startsWith("price_bundle") && p.prices ? `\n-# ${priceLine(p.prices)}` : "";
    return section(`- ${p.emoji} **${name}**\n${desc}${prices}`,
      button(2, de ? "Details ansehen" : "View details", E.view, `gevo:${key}`));
  };

  const head = de
    ? `# ${E.bill} Preisliste – Gevo Studio
> Design, Frontend und Backend aus einer Hand: Wähle unten eine Leistung und klicke auf **Details ansehen** für alle Preise.

**So einfach geht’s:**
> **1.** Leistung oder Bundle auswählen
> **2.** Details & Preise ansehen
> **3.** Kaufticket eröffnen und persönliches Angebot erhalten

-# Alle Preise sind Startpreise in EUR und können je nach Umfang variieren. Gemäß \`§ 19 UStG\` wird keine Umsatzsteuer berechnet.`
    : `# ${E.bill} Price list – Gevo Studio
> Design, frontend and backend from a single source: choose a service below and click **View details** for all prices.

**It's that simple:**
> **1.** Choose a service or bundle
> **2.** View details & prices
> **3.** Open a purchase ticket and get your personal offer

-# All prices are starting prices in EUR and may vary depending on scope. According to \`§ 19 UStG\` no VAT is charged.`;

  return container([
    banner && media(banner),
    text(head),
    sep(),
    text(de ? `## ${E.star} Einzelleistungen` : `## ${E.star} Individual services`),
    item("price_detail:ui"),
    item("price_detail:frontend"),
    item("price_detail:backend"),
    sep(),
    text(de
      ? `## ${E.gift} Spar-Bundles\n-# Mehrere Systeme im Paket – günstiger als einzeln gekauft.`
      : `## ${E.gift} Value bundles\n-# Several systems in one package – cheaper than buying them separately.`),
    item("price_bundle:rp_core"),
    item("price_bundle:economy"),
    sep(),
    text(de
      ? `## ${E.fast} Express gefällig?\n> ${E.fast} **Fast Delivery** · +80% Aufpreis\n> ${E.nextday} **Next Day Delivery** · +120% Aufpreis\n${FOOTER}`
      : `## ${E.fast} Need it faster?\n> ${E.fast} **Fast Delivery** · +80% surcharge\n> ${E.nextday} **Next Day Delivery** · +120% surcharge\n${FOOTER}`),
    ...(de ? [sep(), translate("pricing_main")] : []),
  ]);
}

/** Private Antwort auf "Details ansehen" */
export function priceDetail(key) {
  const p = PRICE_ITEMS[key];
  if (!p) return null;
  const prices = p.prices
    ? p.prices.map(([n, eur]) => `> ${n} · **${eur.toFixed(2)}€**`).join("\n")
    : "> Preis auf Anfrage – du bekommst im Kaufticket ein persönliches Angebot.";
  return container([
    text(`## ${p.emoji} ${p.name}
${p.text}

**Preise:**
${prices}

-# Alle Preise sind Startpreise in EUR und können je nach Umfang variieren. Gemäß \`§ 19 UStG\` wird keine Umsatzsteuer berechnet.
${FOOTER}`),
    row(linkButton("Kaufticket eröffnen", E.cart,
      `https://discord.com/channels/${CONFIG.guildId}/${CONFIG.channels.ticket}`)),
  ]);
}
