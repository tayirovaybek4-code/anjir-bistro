"use strict";

const byId = id => document.getElementById(id);
const date = byId("date");
const time = byId("time");
const guests = byId("guests");
const feedback = byId("feedback");
const reserve = byId("reserve");
const dialog = byId("reservations");
const list = byId("reservation-list");
const key = "anjir-shared-bookings";
const startAt = (day, hour) => Date.parse(day + "T" + hour + ":00+05:00");
let settings;
let busy = [];
let selected = null;
let loading = true;
let submitting = false;
let request = 0;
let retryId;
let retryData;

function history() {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}

function remember(items) {
  try { localStorage.setItem(key, JSON.stringify(items)); }
  catch { /* The booking is already saved on the server. */ }
}

async function api(data) {
  if (!window.BOOKING_ENDPOINT) throw Error("Bron tizimi ulanmoqda.");
  const url = new URL(window.BOOKING_ENDPOINT);
  if (!data) url.searchParams.set("day", date.value);
  const result = await fetch(url, {
    ...(data && {method:"POST", headers:{"Content-Type":"text/plain"}, body:JSON.stringify(data)}),
    signal: AbortSignal.timeout(20000)
  });
  if (!result.ok) throw Error("Bron serveriga ulanib bo‘lmadi.");
  const body = await result.json();
  if (!body.ok) throw Error(body.error);
  return body;
}

function available(table, start) {
  return !loading && !submitting && start > Date.now() && table.capacity >= Number(guests.value)
    && !busy.some(r => r.table === table.id && r.start < start + settings.duration * 60000
      && start < r.start + r.duration * 60000);
}

function render() {
  const map = byId("tables");
  const start = startAt(date.value, time.value);
  const table = settings?.tables.find(t => t.id === selected);
  if (!submitting && (!table || !available(table, start))) selected = null;
  const focused = document.activeElement?.dataset?.tableId;
  map.replaceChildren();
  for (const t of settings?.tables || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = t.capacity === 2 ? "table round" : "table";
    button.dataset.tableId = t.id;
    button.disabled = !available(t, start);
    button.setAttribute("aria-pressed", String(selected === t.id));
    const label = document.createElement("strong");
    label.textContent = t.name;
    const size = document.createElement("small");
    size.textContent = t.capacity + " o‘rin";
    const position = document.createElement("span");
    position.textContent = "Qator " + (t.row || Math.ceil(t.id / 3));
    position.className = "table-position";
    button.append(label, size, position);
    button.onclick = () => {
      selected = selected === t.id ? null : t.id;
      feedback.textContent = "";
      render();
    };
    map.append(button);
    if (focused === button.dataset.tableId && !button.disabled) button.focus();
  }
  reserve.disabled = loading || submitting || selected === null;
  byId("selection").textContent = selected === null ? "Xaritadan stol tanlang" :
    table.name + "-stol tanlandi. " + (table.row || Math.ceil(table.id / 3)) + "-qator · " + table.capacity +
    " o‘rin. Sizni " + date.value + " kuni soat " + time.value + " da kutamiz.";
}

async function refresh(message = "", autoNext = false) {
  const current = ++request;
  const previous = time.value;
  loading = true;
  time.disabled = true;
  reserve.disabled = true;
  for (const button of byId("tables").children) button.disabled = true;
  feedback.textContent = "Bandlik tekshirilmoqda…";
  try {
    const data = await api();
    if (request !== current) return;
    settings = data.settings;
    busy = data.busy;
    const validTimes = settings.times.filter(hour => startAt(date.value, hour) > Date.now());
    if (!validTimes.length && autoNext) {
      date.valueAsNumber += 86400000;
      return refresh(message);
    }
    time.replaceChildren(...validTimes.map(hour => new Option(hour, hour)));
    if (validTimes.includes(previous)) time.value = previous;
    if (!validTimes.length) time.add(new Option("Vaqt mavjud emas", ""));
    time.disabled = !validTimes.length;
    const previousGuests = guests.value;
    const max = Math.min(100, Math.max(1, ...settings.tables.map(t => t.capacity)));
    guests.replaceChildren(...Array.from({length:max}, (_,i) => new Option((i+1)+" kishi", i+1)));
    guests.value = Math.min(Number(previousGuests) || 2, max);
    if (data.site?.brand) {
      byId("brand-name").textContent = byId("footer-brand").textContent = data.site.brand;
      document.title = data.site.brand + " — Menyu va stol band qilish";
    }
    if (data.site?.heading) byId("hero-title").textContent = data.site.heading;
    const hero = byId("hero-title").closest(".hero");
    if (data.site?.hero) {
      try {
        const photo = await resolvePhoto(data.site.hero);
        if (request !== current) return;
        hero.style.setProperty("--hero-image", 'url(' + JSON.stringify(photo) + ')');
      } catch (_) {
        if (request !== current) return;
        hero.style.removeProperty("--hero-image");
      }
    } else hero.style.removeProperty("--hero-image");
    if (Array.isArray(data.menu)) {
      window.PREORDER_ENABLED = true;
      renderMenu(data.menu);
    }
    byId("duration").textContent = "Bron davomiyligi · " + settings.duration + " daqiqa";
    feedback.textContent = message || (validTimes.length ? "" : "Bu sana uchun boshqa vaqt qolmadi.");
    loading = false;
  } catch (error) {
    if (request !== current) return;
    feedback.textContent = message || error.message;
  }
  render();
}

date.min = new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tashkent"}).format(new Date());
date.value = date.min;
date.onchange = () => { selected = null; refresh(); };
time.onchange = guests.onchange = () => { feedback.textContent = ""; render(); };

byId("booking").onsubmit = async event => {
  event.preventDefault();
  if (reserve.disabled) return;
  const table = settings.tables.find(t => t.id === selected);
  const booking = {action:"book",table:table.id,day:date.value,hour:time.value,
    guests:Number(guests.value),name:byId("customer").value.trim(),phone:byId("phone").value.trim(),
    order:orderPayload()};
  const fingerprint = JSON.stringify(booking);
  if (retryData !== fingerprint) retryId = crypto.randomUUID();
  retryData = fingerprint;
  submitting = true;
  render();
  feedback.textContent = "Bron saqlanmoqda…";
  let message;
  try {
    const result = await api({...booking,id:retryId});
    const record = {id:retryId,table:table.name,day:booking.day,hour:booking.hour,guests:booking.guests,status:result.status};
    remember([...history().filter(item => item.id !== record.id),record]);
    retryData = null;
    order.clear();
    renderOrder();
    byId("order-feedback").textContent = "";
    byId("order-link").hidden = true;
    selected = null;
    showConfirmation(booking, table, result);
    message = "Stol " + table.name + " · " + booking.day + " soat " + booking.hour + " ga band qilindi.";
    if (booking.order.length) message += " Taom buyurtmangiz ham saqlandi.";
    if (result.status === "Kutilmoqda") message = "Bron so‘rovi yuborildi. Admin tasdig‘ini «Bronlarim» bo‘limida tekshiring.";
  } catch (error) {
    message = error.message;
  }
  submitting = false;
  await refresh(message);
};

function showConfirmation(booking, table, result) {
  const pending = result.status === "Kutilmoqda";
  byId("confirmation-title").textContent = pending ? "Bron so‘rovingiz qabul qilindi" : "Sizni kutib qolamiz!";
  byId("confirmation-note").textContent = pending
    ? "Bizni tanlaganingiz uchun katta rahmat! Tasdiqni «Bronlarim» bo‘limida ko‘rishingiz mumkin."
    : "Bizni tanlaganingiz uchun katta rahmat! Tashrifingiz maroqli o‘tsin. Sizni dasturxonimiz atrofida yana ko‘rishdan xursand bo‘lamiz.";
  const details = byId("confirmation-details");
  details.replaceChildren();
  const day = new Intl.DateTimeFormat("uz-UZ", {dateStyle:"long",timeZone:"Asia/Tashkent"})
    .format(startAt(booking.day,booking.hour));
  for (const [label,value] of [["Sana",day],["Vaqt",booking.hour],
    ["Joy",table.name + "-stol · " + (table.row || Math.ceil(table.id/3)) + "-qator"],
    ["Mehmonlar",booking.guests + " kishi"]]) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    details.append(term, description);
  }
  const summary = byId("confirmation-order");
  summary.replaceChildren();
  if (result.preorder?.items.length) {
    const heading = document.createElement("h3");
    heading.textContent = "Oldindan buyurtma";
    summary.append(heading);
    for (const item of result.preorder.items) {
      const line = document.createElement("p");
      line.textContent = item.name + " × " + item.quantity + " · " + money(item.price * item.quantity);
      summary.append(line);
    }
    const total = document.createElement("strong");
    total.textContent = "Jami · " + money(result.preorder.total);
    summary.append(total);
  }
  const transfer = result.transfer;
  byId("card-transfer").hidden = !transfer;
  if (transfer) {
    byId("transfer-total").textContent = "Depozit va taomlar uchun jami · " + money(transfer.total);
    byId("transfer-card").textContent = transfer.card.match(/.{4}/g).join(" ");
    const feedback = byId("transfer-feedback");
    feedback.textContent = "Raqamni ilovadagi oluvchi maydoniga joylang. Restoran o‘tkazmani tekshirib tasdiqlaydi.";
    byId("copy-card").onclick = async () => {
      try {
        await navigator.clipboard.writeText(transfer.card);
        feedback.textContent = "Raqam nusxalandi. Uni ilovadagi oluvchi maydoniga joylang.";
      } catch {
        feedback.textContent = "Karta raqamini yuqoridan belgilab nusxalang.";
      }
    };
  }
  byId("confirmation").showModal();
}

function renderHistory() {
  const records = history();
  list.replaceChildren();
  if (!records.length) list.textContent = "Hozircha bronlar yo‘q.";
  for (const record of records) {
    const row = document.createElement("div");
    row.className = "record";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Stol " + record.table + " · " + record.guests + " kishi";
    const when = document.createElement("p");
    when.textContent = record.day + " · " + record.hour;
    if (record.status) {
      when.textContent += " · " + record.status;
      api({action:"status",id:record.id}).then(result => {
        when.textContent = record.day + " · " + record.hour + " · " + result.status;
        if (!["Band","Kutilmoqda"].includes(result.status)) row.querySelector("button")?.remove();
      }).catch(() => {
        when.textContent += " · Holat yangilanmadi";
      });
    }
    details.append(title, when);
    row.append(details);
    if (startAt(record.day,record.hour) > Date.now()) {
      const cancel = document.createElement("button");
      cancel.className = "outline";
      cancel.textContent = "Bekor qilish";
      cancel.onclick = async () => {
        cancel.disabled = true;
        try {
          await api({action:"cancel",id:record.id});
          remember(history().filter(item => item.id !== record.id));
          renderHistory();
          refresh("Bron bekor qilindi.");
        } catch (error) {
          when.textContent = error.message;
          cancel.disabled = false;
        }
      };
      row.append(cancel);
    }
    list.append(row);
  }
}

byId("history").onclick = () => { renderHistory(); dialog.showModal(); };
refresh("", true);

