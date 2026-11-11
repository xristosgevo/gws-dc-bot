import {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.AUTH_DISCORD_ID; // gleiche App wie OAuth
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const BOT_SECRET = process.env.BOT_API_SECRET;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional: sofortige Registrierung
const EMBED_IMAGE = process.env.BOT_EMBED_IMAGE; // optional: öffentliche Bild-URL

// Banner liegen lokal -> werden als Anhang verschickt (kein Host nötig).
const BANNER_PATH = path.join(process.cwd(), "bot", "invoice-banner.png");
const PAYMENTS_PATH = path.join(process.cwd(), "bot", "payment-methods.png");

// Rechnungs-Tracking: orderId -> { channelId, messageId, customerId, ... }
const TRACK_PATH = path.join(process.cwd(), "bot", "tracked-invoices.json");
// Bestell-Speicher der Website (nur LESEN — Backend bleibt unangetastet!)
const ORDERS_PATH = path.join(process.cwd(), ".data", "orders.json");

const RED = 0xed4245;
const GREEN = 0x57f287;

if (!TOKEN || !APP_ID) {
  console.error("DISCORD_BOT_TOKEN oder AUTH_DISCORD_ID fehlt in .env.local");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Tracking-Helfer                                                     */
/* ------------------------------------------------------------------ */
function loadTracked() {
  try {
    return JSON.parse(readFileSync(TRACK_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveTracked(data) {
  try {
    writeFileSync(TRACK_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("tracked-invoices.json schreiben fehlgeschlagen:", e);
  }
}

function euro(n) {
  return `${Number(n).toFixed(2).replace(".", ",")} EUR`;
}

/* ------------------------------------------------------------------ */
/*  Rechnungs-Embed (Components V2)                                     */
/*  state: "open" | "reminded" | "paid"                                 */
/* ------------------------------------------------------------------ */
function buildInvoice({ state, produkt, preis, beschreibung, orderId, url, customerId }) {
  const files = [];
  let bannerUrl = EMBED_IMAGE || null;
  if (existsSync(BANNER_PATH)) {
    files.push(new AttachmentBuilder(BANNER_PATH, { name: "invoice-banner.png" }));
    bannerUrl = "attachment://invoice-banner.png";
  }

  const container = new ContainerBuilder().setAccentColor(
    state === "paid" ? GREEN : RED
  );

  if (bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl)
      )
    );
  }

  // Status in Farbe (ANSI: rot/grün)
  const status =
    state === "paid"
      ? "[1;32m●  BEZAHLT[0m"
      : state === "reminded"
        ? "[1;31m●  ÜBERFÄLLIG — ZAHLUNG AUSSTEHEND[0m"
        : "[1;31m●  NOCH NICHT BEZAHLT[0m";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Rechnung erstellt\n\`\`\`ansi\n${status}\n\`\`\``
    )
  );

  const details =
    `**Produkt**\n${produkt}\n\n` +
    (beschreibung ? `${beschreibung}\n\n` : "") +
    `**Betrag**\n\`${euro(preis)}\`\n\n` +
    `**Rechnungs-Nr.**\n\`${orderId}\`` +
    (customerId ? `\n\n**Kunde**\n<@${customerId}>` : "");

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(details));
  container.addSeparatorComponents(new SeparatorBuilder());

  if (state === "paid") {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "**Zahlung eingegangen — vielen Dank!**\n-# Beleg & Rechnung wurden automatisch per E-Mail versendet."
      )
    );
  } else {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Rechnung ansehen & bezahlen**\n-# Sicher über Stripe · Beleg automatisch per Mail`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel("Rechnung bezahlen")
            .setStyle(ButtonStyle.Link)
            .setURL(url)
        )
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "-# Gevo Web Studio · gevo-studio.de · Sichere Zahlung über Stripe"
    )
  );

  return { container, files };
}

/* ------------------------------------------------------------------ */
/*  Slash-Commands                                                      */
/* ------------------------------------------------------------------ */
const rechnungCmd = new SlashCommandBuilder()
  .setName("rechnung")
  .setDescription("Erstellt eine Bezahl-Rechnung mit Link")
  .addStringOption((o) =>
    o.setName("produkt").setDescription("Produktname").setRequired(true)
  )
  .addNumberOption((o) =>
    o.setName("preis").setDescription("Preis in EUR").setRequired(true)
  )
  .addUserOption((o) =>
    o.setName("kunde").setDescription("Kunde (für Erinnerungen per DM)")
  )
  .addStringOption((o) =>
    o.setName("beschreibung").setDescription("Optionale Beschreibung")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const erinnerungCmd = new SlashCommandBuilder()
  .setName("zahlungserinnerung")
  .setDescription("Erinnert den Kunden per DM an eine offene Rechnung")
  .addStringOption((o) =>
    o
      .setName("rechnung")
      .setDescription("Rechnungs-Nr. (z. B. GWS-ABC123)")
      .setRequired(true)
  )
  .addUserOption((o) =>
    o.setName("kunde").setDescription("Kunde (falls bei /rechnung nicht angegeben)")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const paymentsCommand = new SlashCommandBuilder()
  .setName("zahlungen")
  .setDescription("Zeigt alle verfügbaren Zahlungsmethoden");

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const bodyCmds = [
    rechnungCmd.toJSON(),
    erinnerungCmd.toJSON(),
    paymentsCommand.toJSON(),
  ];
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), {
      body: bodyCmds,
    });
    console.log(
      "Slash-Commands /rechnung + /zahlungserinnerung + /zahlungen registriert (sofort)."
    );
  } else {
    await rest.put(Routes.applicationCommands(APP_ID), { body: bodyCmds });
    console.log(
      "Slash-Commands /rechnung + /zahlungserinnerung + /zahlungen global registriert (~1h)."
    );
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ------------------------------------------------------------------ */
/*  Bezahlt-Watcher: liest NUR .data/orders.json der Website            */
/* ------------------------------------------------------------------ */
async function editTrackedMessage(entry, state) {
  const channel = await client.channels.fetch(entry.channelId);
  const msg = await channel.messages.fetch(entry.messageId);
  const { container, files } = buildInvoice({ ...entry, state });
  await msg.edit({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
}

let watching = false;
async function watchPaid() {
  if (watching) return;
  watching = true;
  try {
    const tracked = loadTracked();
    const openIds = Object.keys(tracked).filter(
      (id) => tracked[id].state !== "paid"
    );
    if (openIds.length === 0) return;

    let orders = {};
    try {
      orders = JSON.parse(readFileSync(ORDERS_PATH, "utf8"));
    } catch {
      return; // Datei fehlt/gerade im Schreibvorgang -> nächster Tick
    }

    for (const id of openIds) {
      if (orders[id]?.status === "paid") {
        try {
          await editTrackedMessage(tracked[id], "paid");
          tracked[id].state = "paid";
          saveTracked(tracked);
          console.log(`Rechnung ${id} bezahlt -> Embed auf Grün gesetzt.`);
        } catch (e) {
          console.error(`Embed-Update für ${id} fehlgeschlagen:`, e.message);
        }
      }
    }
  } finally {
    watching = false;
  }
}

client.once("clientReady", async (c) => {
  console.log(`✅ Bot online als ${c.user.tag} (${c.user.id})`);
  c.user.setPresence({
    status: "online",
    activities: [{ name: "gevo-studio.de", type: ActivityType.Watching }],
  });
  try {
    await registerCommands();
  } catch (e) {
    console.error("Command-Registrierung fehlgeschlagen:", e);
  }
  setInterval(watchPaid, 45_000);
});

/* ------------------------------------------------------------------ */
/*  Interaktionen                                                       */
/* ------------------------------------------------------------------ */
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  /* ---------- /zahlungen ---------- */
  if (i.commandName === "zahlungen") {
    try {
      const container = new ContainerBuilder().setAccentColor(0x25ff8a);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Zahlungsmethoden\n` +
            `Bei uns bezahlst du sicher und verschlüsselt über **Stripe** — mit folgenden Methoden:\n\n` +
            `**Express**\n> Apple Pay · Link · Amazon Pay\n\n` +
            `**Karten**\n> Visa · Mastercard · American Express · Discover\n\n` +
            `**Weitere Methoden**\n> Klarna · Bancontact · eps-Überweisung · MB WAY · Satispay`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "-# Gevo Web Studio · Sichere Zahlung über Stripe · Rechnung automatisch per Mail"
        )
      );
      await i.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (e) {
      console.error("zahlungen command failed:", e);
      if (!i.replied && !i.deferred) {
        await i.reply({
          content: "Konnte die Zahlungsmethoden nicht anzeigen.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  /* ---------- /zahlungserinnerung ---------- */
  if (i.commandName === "zahlungserinnerung") {
    const orderId = i.options.getString("rechnung", true).trim();
    const kundeOpt = i.options.getUser("kunde");

    try {
      const tracked = loadTracked();
      const entry = tracked[orderId];
      if (!entry) {
        await i.reply({
          content: `Rechnung \`${orderId}\` ist nicht bekannt. Wurde sie mit /rechnung erstellt?`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (entry.state === "paid") {
        await i.reply({
          content: `Rechnung \`${orderId}\` ist bereits **bezahlt** — keine Erinnerung nötig.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const customerId = kundeOpt?.id ?? entry.customerId;
      if (!customerId) {
        await i.reply({
          content:
            "Kein Kunde hinterlegt. Gib die Option **kunde** an (oder erstelle Rechnungen künftig mit /rechnung kunde:@…).",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      entry.customerId = customerId;

      // 1) DM an den Kunden
      let dmOk = true;
      try {
        const user = await client.users.fetch(customerId);
        await user.send(
          `Hey, du hast deine Rechnung noch nicht bezahlt.\n\n` +
            `**Rechnung:** \`${orderId}\` · ${euro(entry.preis)}\n` +
            `Hier bezahlen: ${entry.url}`
        );
      } catch {
        dmOk = false;
      }

      // 2) Embed im Kanal auf "Überfällig" (rot) setzen
      entry.state = "reminded";
      saveTracked(tracked);
      await editTrackedMessage(entry, "reminded");

      await i.reply({
        content: dmOk
          ? `Erinnerung für \`${orderId}\` verschickt — DM an <@${customerId}> ist raus, Status steht auf **Überfällig**.`
          : `Status für \`${orderId}\` steht auf **Überfällig** — aber die DM an <@${customerId}> konnte nicht zugestellt werden (DMs geschlossen).`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.error("zahlungserinnerung failed:", e);
      if (!i.replied && !i.deferred) {
        await i.reply({
          content: "Erinnerung fehlgeschlagen.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  /* ---------- /rechnung ---------- */
  if (i.commandName !== "rechnung") return;

  const produkt = i.options.getString("produkt", true);
  const preis = i.options.getNumber("preis", true);
  const beschreibung = i.options.getString("beschreibung") ?? undefined;
  const kunde = i.options.getUser("kunde");

  if (!BOT_SECRET) {
    await i.reply({
      content: "BOT_API_SECRET fehlt auf dem Server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const res = await fetch(`${SITE_URL}/api/bot/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET },
      body: JSON.stringify({ name: produkt, price: preis, description: beschreibung }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      await i.reply({
        content: `Fehler: ${data.error ?? res.status}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const invoice = {
      produkt,
      preis,
      beschreibung,
      orderId: data.id,
      url: data.url,
      customerId: kunde?.id ?? null,
    };

    const { container, files } = buildInvoice({ ...invoice, state: "open" });
    await i.reply({ components: [container], files, flags: MessageFlags.IsComponentsV2 });

    // Nachricht merken, damit Erinnerung & Bezahlt-Watcher sie updaten können
    const msg = await i.fetchReply();
    const tracked = loadTracked();
    tracked[data.id] = {
      ...invoice,
      channelId: msg.channelId,
      messageId: msg.id,
      state: "open",
      createdAt: Date.now(),
    };
    saveTracked(tracked);
  } catch (e) {
    console.error("rechnung command failed:", e);
    if (!i.replied && !i.deferred) {
      await i.reply({
        content: "Konnte die Rechnung nicht erstellen.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.on("error", (e) => console.error("Discord client error:", e));
client.login(TOKEN);
