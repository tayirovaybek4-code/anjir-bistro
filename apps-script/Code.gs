function sheet(name) {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID") || "1w66wvpzHCVMl_oZsdAoByPYR6PaHAVomnaLyABwDwYg";
  return SpreadsheetApp.openById(id).getSheetByName(name);
}

function config() {
  const rows = sheet("Sozlamalar").getDataRange().getDisplayValues();
  const tables = sheet("Stollar").getDataRange().getValues().slice(1)
    .filter(row => row[0] && row[3] === true)
    .map(([id, name, capacity]) => ({id: Number(id), name: String(name), capacity: Number(capacity)}));
  const minute = value => /^\d\d:\d\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : NaN;
  const open = minute(rows[2][1]), close = minute(rows[3][1]);
  const duration = Number(rows[4][1]), step = Number(rows[5][1]);
  if (!(open >= 0 && close <= 1440 && close > open && duration >= 15 && duration <= close-open && step >= 5 && step <= 120)) throw Error("Sozlamalarni tekshiring.");
  const times = [];
  for (let m = open; m + duration <= close; m += step) {
    times.push(String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"));
  }
  return {name: rows[1][1], duration, times, tables};
}

function startAt(day, hour) {
  return Date.parse(day+"T"+hour+":00+05:00");
}

function records(tab) {
  return tab.getDataRange().getDisplayValues().slice(1).map((r,i) => ({
    row:i+2,id:r[0],day:r[2],hour:r[3],table:Number(r[4]),guests:Number(r[5]),
    name:r[6],phone:r[7],status:r[8],duration:Number(r[9]),start:startAt(r[2],r[3])
  })).filter(r=>r.id);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function holdsTable_(record) {
  return record.status === "Band" || record.status === "Kutilmoqda";
}

function doGet(event) {
  try {
    if (event.parameter.photo) return json({ok:true,image:readPhoto_(event.parameter.photo)});
    const settings = config();
    const day = event.parameter.day;
    const busy = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? records(sheet("Bronlar"))
      .filter(r=>holdsTable_(r) && r.day===day)
      .map(({table,start,duration})=>({table,start,duration})) : [];
    const menu = loadMenu_();
    return json({ok:true,settings,busy,site:loadSite_(),...(menu && {menu})});
  } catch (error) {
    console.error(error);
    return json({ok:false,error:"Bron tizimi vaqtincha ishlamayapti."});
  }
}

function doPost(event) {
  let lock;
  try {
    const input = JSON.parse(event.postData.contents);
    if (String(input.action).startsWith("admin.")) return adminRequest_(input);
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const tab = sheet("Bronlar");
    const rows = records(tab);
    if (!/^[a-f0-9-]{36}$/.test(input.id || "")) return json({ok:false,error:"Bron kodi yaroqsiz."});
    const existing = rows.find(r=>r.id===input.id);
    if (input.action === "status") {
      return existing ? json({ok:true,status:existing.status}) : json({ok:false,error:"Bron topilmadi."});
    }
    if (input.action==="cancel") {
      if (existing?.status === "Bekor qilingan") return json({ok:true});
      if (!existing || !holdsTable_(existing) || existing.start<=Date.now()) return json({ok:false,error:"Bu bronni bekor qilib bo‘lmaydi."});
      tab.getRange(existing.row,9).setValue("Bekor qilingan");
      SpreadsheetApp.flush();
      return json({ok:true});
    }
    if (existing) return json({ok:holdsTable_(existing),status:existing.status,preorder:JSON.parse(tab.getRange(existing.row,11).getValue() || "null"),error:"Bron kodi ishlatilgan."});
    const settings = config();
    const start = startAt(input.day,input.hour);
    const table = settings.tables.find(t=>t.id===input.table);
    const name = String(input.name || "").trim();
    const phone = String(input.phone || "").trim();
    const isoDay = Number.isFinite(start) ? new Date(start+18000000).toISOString().slice(0,10) : "";
    if (input.action!=="book" || input.day!==isoDay || !(start>Date.now() && start<Date.now()+366*86400000)
      || !settings.times.includes(input.hour) || !table || !Number.isInteger(input.guests)
      || input.guests<1 || input.guests>table.capacity || name.length<2 || name.length>80
      || !/^\+?[\d ()-]{7,24}$/.test(phone) || phone.replace(/\D/g,"").length<7) {
      return json({ok:false,error:"Bron ma’lumotlarini tekshiring."});
    }
    if (rows.some(r=>r.table===table.id && holdsTable_(r) &&
      r.start<start+settings.duration*60000 && start<r.start+r.duration*60000)) {
      return json({ok:false,error:"Bu vaqtga stol band. Boshqa vaqtni tanlang."});
    }
    let preorder;
    try { preorder = validateOrder_(input.order); }
    catch (error) { return json({ok:false,error:error.message}); }
    const row = tab.getRange(tab.getLastRow()+1,1,1,11);
    row.setNumberFormats([["@","@","@","@","0","0","@","@","@","0","@"]]);
    const safeName = /^[=+@-]/.test(name) ? "'"+name : name;
    const status = PropertiesService.getScriptProperties().getProperty("TELEGRAM_APPROVALS") === "on" ? "Kutilmoqda" : "Band";
    row.setValues([[input.id,new Date().toISOString(),input.day,input.hour,table.id,input.guests,safeName,"'"+phone,status,settings.duration,preorder ? JSON.stringify(preorder) : ""]]);
    SpreadsheetApp.flush();
    lock.releaseLock();
    lock = null;
    notifyNewBooking_({ id: input.id, status, day: input.day, hour: input.hour, table: table.name, guests: input.guests });
    const site = loadSite_();
    return json({ok:true,status,preorder,site,transfer:cardTransfer_(preorder,site)});
  } catch (error) {
    console.error(error);
    return json({ok:false,error:"Bronni saqlab bo‘lmadi. Qayta urinib ko‘ring."});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function notifyNewBooking_(booking) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const token = properties.getProperty("TELEGRAM_BOT_TOKEN");
    const chatId = properties.getProperty("TELEGRAM_CHAT_ID");
    if (!token || !chatId) return;

    const sheetId = properties.getProperty("SHEET_ID") || sheet("Bronlar").getParent().getId();
    const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: chatId,
        text: [
          "🔔 Yangi bron",
          "Stol " + booking.table + " · " + booking.guests + " kishi",
          booking.day + " · " + booking.hour
        ].join("\n"),
        reply_markup: {
          inline_keyboard: [
            ...(booking.status === "Kutilmoqda" ? [[
              {text:"Tasdiqlash",callback_data:"approve:"+booking.id},
              {text:"Rad etish",callback_data:"reject:"+booking.id}
            ]] : []), [{
            text: "Bronlar jadvalini ochish",
            url: "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit"
          }]]
        }
      })
    });
    if (response.getResponseCode() !== 200 || !JSON.parse(response.getContentText()).ok) {
      console.warn("Telegram xabari yuborilmadi. HTTP " + response.getResponseCode());
    }
  } catch {
    console.warn("Telegram xabari yuborilmadi.");
  }
}

function enableTelegramApprovals() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("TELEGRAM_BOT_TOKEN") || !/^\d+$/.test(properties.getProperty("TELEGRAM_CHAT_ID") || "")) {
    throw new Error("Avval Telegram shaxsiy chatini ulang.");
  }
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === "pollTelegramApprovals_")) {
    ScriptApp.newTrigger("pollTelegramApprovals_").timeBased().everyMinutes(1).create();
  }
  properties.setProperty("TELEGRAM_APPROVALS", "on");
}

function pollTelegramApprovals_() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty("TELEGRAM_BOT_TOKEN");
  const admin = properties.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !admin) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const offset = Number(properties.getProperty("TELEGRAM_UPDATE_OFFSET") || 0);
    const updates = telegramApprovalApi_(token,"getUpdates",{offset,allowed_updates:["callback_query"],limit:20});
    const tab = sheet("Bronlar");
    for (const update of updates) {
      const callback = update.callback_query;
      if (callback && String(callback.from.id) === admin && String(callback.message?.chat?.id) === admin) {
        const action = /^(approve|reject):([a-f0-9-]{36})$/.exec(callback.data || "");
        if (action) {
          const record = records(tab).find(item => item.id === action[2]);
          let status = record?.status || "Bron topilmadi";
          if (record?.status === "Kutilmoqda" && record.start > Date.now()) {
            status = action[1] === "approve" ? "Band" : "Rad etildi";
            tab.getRange(record.row,9).setValue(status);
            SpreadsheetApp.flush();
          } else if (status === "Kutilmoqda") {
            status = "Bron vaqti o‘tgan";
          }
          try {
            telegramApprovalApi_(token,"answerCallbackQuery",{callback_query_id:callback.id,text:status});
          } catch {
            // Telegram may expire the popup before the scheduled poll runs.
          }
          telegramApprovalApi_(token,"editMessageText",{
            chat_id:admin,message_id:callback.message.message_id,
            text:callback.message.text.split("\nHolat · ")[0]+"\nHolat · "+status,
            reply_markup:{inline_keyboard:callback.message.reply_markup?.inline_keyboard?.filter(row => row.every(button => button.url)) || []}
          });
        }
      }
      properties.setProperty("TELEGRAM_UPDATE_OFFSET",String(update.update_id+1));
    }
  } catch {
    console.warn("Telegram bron qarorini qayta ishlashda xato.");
  } finally {
    lock.releaseLock();
  }
}

function telegramApprovalApi_(token, method, payload) {
  const response = UrlFetchApp.fetch("https://api.telegram.org/bot"+token+"/"+method,{
    method:"post",contentType:"application/json",muteHttpExceptions:true,payload:JSON.stringify(payload)
  });
  const body = JSON.parse(response.getContentText());
  if (!body.ok && !String(body.description).includes("message is not modified")) throw new Error("Telegram API xatosi.");
  return body.result;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Anjir Bistro")
    .addItem("Admin panel", "openAdmin").addToUi();
}

function openAdmin() {
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput("<!doctype html>\n<html lang=\"uz\">\n<meta charset=\"utf-8\">\n<style>\n*{box-sizing:border-box}body{margin:0;background:#f4ebe0;color:#39231d;font:14px system-ui}header{background:#621e25;color:#fff4e8;padding:20px 26px}h1{font:30px Georgia;margin:0}nav{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}button{cursor:pointer;border:1px solid #ad8973;border-radius:5px;padding:8px 12px;background:#fff7ec;color:#621e25;font:inherit}button[type=submit]{background:#621e25;color:white}main{padding:20px 26px}.panel{background:#fff9f1;border:1px solid #dbc5af;padding:18px;border-radius:7px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:grid;gap:5px;font-weight:600}input,select,textarea{width:100%;padding:8px;border:1px solid #c8aa92;border-radius:5px;background:white;font:inherit}textarea{resize:vertical}form button{margin-top:13px}label.check{display:flex;align-items:center}label.check input{width:auto}img{display:block;max-height:100px;max-width:100%;margin:8px 0}#status{min-height:20px;color:#621e25}[hidden]{display:none!important}@media(max-width:520px){.grid{grid-template-columns:1fr}}\n</style>\n<header><h1>Zarafshon</h1><nav>\n  <button type=\"button\" id=\"show-menu\">Menyu</button><button type=\"button\" id=\"show-site\">Sayt dizayni</button>\n  <button type=\"button\" data-tab=\"Bronlar\">Bron va buyurtmalar</button>\n  <button type=\"button\" data-tab=\"Stollar\">Stollar</button>\n  <button type=\"button\" data-tab=\"Sozlamalar\">Ish vaqti</button>\n</nav></header>\n<main>\n  <p><a href=\"https://tayirovaybek4-code.github.io/anjir-bistro/admin.html\" target=\"_blank\" rel=\"noopener\">Admin saytini ochish</a> · <button type=\"button\" id=\"issue-key\">Yangi kirish kaliti yaratish</button></p>\n  <input id=\"access-key\" aria-label=\"Kirish kaliti\" readonly hidden>\n  <p id=\"status\" role=\"status\">Yuklanmoqda…</p>\n  <section class=\"panel\" id=\"menu-panel\">\n    <label>Taomni tanlang<select id=\"dish\"></select></label>\n    <form id=\"dish-form\">\n      <div class=\"grid\">\n        <label>Taom nomi<input name=\"name\" required maxlength=\"180\"></label>\n        <label>Bo‘lim<input name=\"category\" required maxlength=\"80\"></label>\n        <label>Narxi, so‘m<input name=\"price\" type=\"number\" min=\"0\" step=\"1\" required></label>\n        <label>Rasm manzili<input name=\"image\" placeholder=\"https://…\" maxlength=\"1500\"></label>\n      </div>\n      <img id=\"preview\" alt=\"Taom rasmi\" hidden>\n      <label>Tavsif<textarea name=\"description\" maxlength=\"1000\"></textarea></label>\n      <label class=\"check\"><input name=\"visible\" type=\"checkbox\"> Saytda ko‘rsatish</label>\n      <button>Taomni saqlash</button>\n    </form>\n  </section>\n  <section class=\"panel\" id=\"site-panel\" hidden>\n    <form id=\"site-form\">\n      <label>Restoran nomi<input name=\"brand\" required maxlength=\"45\"></label>\n      <label>Bosh sarlavha<input name=\"heading\" required maxlength=\"120\"></label>\n      <label>Bosh rasm manzili<input name=\"hero\" placeholder=\"https://…\" maxlength=\"1500\"></label>\n      <button>Saytni saqlash</button>\n    </form>\n  </section>\n</main>\n<script>\nconst byId = id => document.getElementById(id);\nconst form = byId(\"dish-form\");\nconst siteForm = byId(\"site-form\");\nconst status = byId(\"status\");\nlet menu = [];\nfunction fail(error) { status.textContent = error.message; }\nbyId(\"issue-key\").onclick = () => {\n  if (!confirm(\"Yangi kalit yaratilganda avvalgi kalit bilan kirib bo‘lmaydi. Davom etasizmi?\")) return;\n  google.script.run.withFailureHandler(fail).withSuccessHandler(key => {\n    const field = byId(\"access-key\");\n    field.value = key;\n    field.hidden = false;\n    field.select();\n    status.textContent = \"Kalitni nusxalab, admin saytiga kiriting.\";\n  }).issueAdminKey();\n};\nfunction fill(form, values) {\n  for (const field of form.elements) {\n    if (!field.name) continue;\n    if (field.type === \"checkbox\") field.checked = values[field.name] !== false;\n    else field.value = values[field.name] ?? \"\";\n  }\n}\nfunction showDish() {\n  fill(form, menu.find(item => item.id === byId(\"dish\").value) || {});\n  const photo = byId(\"preview\");\n  const image = form.elements.image.value;\n  photo.hidden = !image;\n  if (image) photo.src = image.startsWith(\"assets/\") ? \"https://tayirovaybek4-code.github.io/anjir-bistro/\" + image : image;\n}\nfunction showMenu(items, selected = \"\") {\n  menu = items;\n  byId(\"dish\").replaceChildren(new Option(\"Yangi taom\", \"\"), ...items.map(item => new Option(item.category + \" · \" + item.name,item.id)));\n  byId(\"dish\").value = selected;\n  showDish();\n}\nbyId(\"dish\").onchange = showDish;\nbyId(\"show-menu\").onclick = () => { byId(\"menu-panel\").hidden = false; byId(\"site-panel\").hidden = true; };\nbyId(\"show-site\").onclick = () => { byId(\"menu-panel\").hidden = true; byId(\"site-panel\").hidden = false; };\nfor (const button of document.querySelectorAll(\"[data-tab]\")) {\n  button.onclick = () => google.script.run.withFailureHandler(fail).withSuccessHandler(() => google.script.host.close()).adminTab(button.dataset.tab);\n}\nform.onsubmit = event => {\n  event.preventDefault();\n  const id = byId(\"dish\").value;\n  const item = {...Object.fromEntries(new FormData(form)), id, visible:form.elements.visible.checked};\n  status.textContent = \"Saqlanmoqda…\";\n  google.script.run.withFailureHandler(fail).withSuccessHandler(items => {\n    showMenu(items, id || items.at(-1)?.id);\n    status.textContent = \"Taom saqlandi.\";\n  }).adminSaveMenu(item);\n};\nsiteForm.onsubmit = event => {\n  event.preventDefault();\n  status.textContent = \"Saqlanmoqda…\";\n  google.script.run.withFailureHandler(fail).withSuccessHandler(site => {\n    fill(siteForm,site);\n    status.textContent = \"Sayt ma’lumotlari saqlandi.\";\n  }).adminSaveSite(Object.fromEntries(new FormData(siteForm)));\n};\ngoogle.script.run.withFailureHandler(fail).withSuccessHandler(data => {\n  showMenu(data.menu);\n  fill(siteForm,{brand:\"Zarafshon\",heading:\"Parij ta’mi, Toshkentda\",...data.site});\n  status.textContent = \"\";\n}).adminLoad();\n</script>\n</html>\n").setWidth(850).setHeight(650), "Zarafshon · Admin panel");
}

function adminTab(name) {
  if (!["Bronlar","Stollar","Sozlamalar"].includes(name)) return;
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name).activate();
}

function loadMenu_() {
  const tab = sheet("Menyu");
  if (!tab) return null;
  return tab.getDataRange().getValues().slice(1).filter(row => row[0]).map(row => ({
    id: String(row[0]), category: String(row[1]), name: String(row[2]), price: Number(row[3]),
    image: String(row[4]), description: String(row[5]), visible: row[6] === true
  }));
}

function loadSite_() {
  const tab = sheet("Sayt");
  const [,brand,heading,hero,deposit,confirmationTitle,confirmationNote,transferNote] =
    tab ? tab.getRange("B1:B8").getValues().flat() : [];
  return {
    brand,heading,hero:validImage_(hero) ? (hero || "") : "",
    deposit: Number.isSafeInteger(deposit) && deposit >= 0 && deposit <= 100000000 ? deposit : 100000,
    confirmationTitle:confirmationTitle || "Sizni kutib qolamiz!",
    confirmationNote:confirmationNote || "Bizni tanlaganingiz uchun katta rahmat! Tashrifingiz maroqli o‘tsin. Sizni dasturxonimiz atrofida yana ko‘rishdan xursand bo‘lamiz.",
    transferNote:transferNote || "Raqamni ilovadagi oluvchi maydoniga joylang. Mablag‘ yetmasa, oynaga qaytib, bronni bekor qilishingiz mumkin."
  };
}

function validateOrder_(order) {
  if (order === undefined || (Array.isArray(order) && !order.length)) return null;
  if (!Array.isArray(order) || order.length > 30) throw Error("Buyurtma tarkibini tekshiring.");
  const menu = new Map((loadMenu_() || []).filter(item => item.visible).map(item => [item.id,item]));
  const used = new Set();
  const items = order.map(entry => {
    const item = menu.get(entry?.id);
    if (!item || used.has(item.id) || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 20) {
      throw Error("Menyudagi taom yoki porsiya soni o‘zgargan. Buyurtmani qayta tekshiring.");
    }
    used.add(item.id);
    return {id:item.id,name:item.name,price:item.price,quantity:entry.quantity};
  });
  return {items,total:items.reduce((total,item) => total + item.price * item.quantity,0)};
}

function paymentQuote_(order) {
  const preorder = validateOrder_(order);
  const deposit = loadSite_().deposit;
  const food = preorder?.total ?? 0;
  if (!Number.isSafeInteger(food) || food < 0 || !Number.isSafeInteger((food + deposit) * 100)) {
    throw Error("Buyurtma summasini hisoblab bo‘lmadi.");
  }
  return {deposit,food,total:food + deposit,totalTiyin:(food + deposit) * 100};
}

function cardTransfer_(preorder,site) {
  const card = PropertiesService.getScriptProperties().getProperty("TRANSFER_CARD") || "";
  if (!/^\d{16}$/.test(card)) return null;
  const food = preorder?.total ?? 0;
  return {card,deposit:site.deposit,food,total:site.deposit + food};
}

function adminSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active || active.getId() !== sheet("Bronlar").getParent().getId()) throw Error("Admin panelni Google Sheets ichidan oching.");
  return active;
}

function issueAdminKey() {
  adminSpreadsheet_();
  const key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("ADMIN_KEY_HASH", adminKeyHash_(key));
  return key;
}

function adminKeyHash_(key) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key));
}

function adminRequest_(input) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY_HASH");
  if (!expected || !/^[a-f0-9]{64}$/.test(String(input.key)) || adminKeyHash_(input.key) !== expected) {
    return json({ok:false,error:"Kirish kaliti yaroqsiz."});
  }
  try {
    if (input.action === "admin.menu") return json({ok:true,menu:saveMenu_(sheet("Bronlar").getParent(),input.item)});
    if (input.action === "admin.site") return json({ok:true,site:saveSite_(sheet("Bronlar").getParent(),input.site)});
    if (input.action !== "admin.list") return json({ok:false,error:"Amal topilmadi."});
    const tab = sheet("Bronlar");
    const rows = tab.getLastRow();
    const day = String(input.day || "");
    const all = rows > 1 ? tab.getRange(2,1,rows-1,11).getDisplayValues() : [];
    const bookings = all.filter(row => row[0] && (!day || row[2] === day)).reverse().slice(0,100).map(row => {
      const [id,,day,hour,table,guests,name,phone,status,,order] = row;
      let preorder = null;
      try { preorder = JSON.parse(order || "null"); } catch (_) {}
      return {id,day,hour,table,guests,name,phone,status,preorder};
    });
    return json({ok:true,bookings,menu:loadMenu_() || [],site:loadSite_()});
  } catch (error) {
    return json({ok:false,error:"Amal bajarilmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring."});
  }
}

function adminLoad() {
  const active = adminSpreadsheet_();
  if (!active.getSheetByName("Menyu")) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (!active.getSheetByName("Menyu")) {
        const tab = active.insertSheet("Menyu");
        const rows = [["ID","Bo‘lim","Nomi","Narxi","Rasm","Tavsif","Ko‘rinadi"], ...menuSeed_()];
        tab.getRange(1,1,rows.length,7).setValues(rows);
        tab.setFrozenRows(1);
        active.getSheetByName("Bronlar").getRange("K1").setValue("Oldindan buyurtma");
        SpreadsheetApp.flush();
      }
    } finally {
      lock.releaseLock();
    }
  }
  return {menu:loadMenu_() || [],site:loadSite_()};
}

function adminSaveMenu(item) {
  return saveMenu_(adminSpreadsheet_(),item);
}

function saveMenu_(active,item) {
  const price = Number(item.price);
  const name = String(item.name || "").trim();
  const category = String(item.category || "").trim();
  const image = String(item.image || "").trim();
  const description = String(item.description || "").trim();
  if (!name || name.length > 180 || !category || category.length > 80 || description.length > 1000
    || !Number.isSafeInteger(price) || price < 0 || !validImage_(image)) throw Error("Taom ma’lumotlarini tekshiring.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let tab = active.getSheetByName("Menyu");
    if (!tab) {
      tab = active.insertSheet("Menyu");
      tab.appendRow(["ID","Bo‘lim","Nomi","Narxi","Rasm","Tavsif","Ko‘rinadi"]);
      tab.setFrozenRows(1);
    }
    const found = tab.getDataRange().getDisplayValues().findIndex(row => row[0] === item.id);
    const id = found > 0 ? item.id : Utilities.getUuid();
    const savedImage = item.upload ? storePhoto_(active,item.upload) : image;
    tab.getRange(found > 0 ? found+1 : tab.getLastRow()+1,1,1,7)
      .setValues([[id,plain_(category),plain_(name),price,savedImage,plain_(description),item.visible === true]]);
    SpreadsheetApp.flush();
    return loadMenu_();
  } finally {
    lock.releaseLock();
  }
}

function adminSaveSite(site) {
  return saveSite_(adminSpreadsheet_(),site);
}

function saveSite_(active,site) {
  const brand = String(site.brand || "").trim();
  const heading = String(site.heading || "").trim();
  const hero = String(site.hero || "").trim();
  if (!brand || brand.length > 45 || !heading || heading.length > 120 || !validImage_(hero)) throw Error("Sayt ma’lumotlarini tekshiring.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tab = active.getSheetByName("Sayt") || active.insertSheet("Sayt");
    const current = loadSite_();
    const deposit = String(site.deposit ?? current.deposit).trim();
    const confirmationTitle = String(site.confirmationTitle ?? current.confirmationTitle).trim();
    const confirmationNote = String(site.confirmationNote ?? current.confirmationNote).trim();
    const transferNote = String(site.transferNote ?? current.transferNote).trim();
    if (!/^\d+$/.test(deposit) || Number(deposit) > 100000000 || !confirmationTitle ||
      confirmationTitle.length > 90 || !confirmationNote || confirmationNote.length > 500 ||
      !transferNote || transferNote.length > 500) throw Error("Depozit va matnlarni tekshiring.");
    const savedHero = site.upload ? storePhoto_(active,site.upload) : hero;
    tab.getRange("A1:B8").setValues([["Sozlama","Qiymat"],["Nom",plain_(brand)],["Sarlavha",plain_(heading)],["Rasm",savedHero],
      ["Depozit",Number(deposit)],["Tasdiq sarlavhasi",plain_(confirmationTitle)],["Tasdiq matni",plain_(confirmationNote)],["O‘tkazma matni",plain_(transferNote)]]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return loadSite_();
}

function plain_(text) {
  return /^[=+@-]/.test(text) ? "'"+text : text;
}

function validImage_(value) {
  return !value || value.length <= 1500 && (/^https:\/\/[^\s]+$/i.test(value) || /^assets\/[a-z\d.-]+$/i.test(value) || /^photo:[a-f0-9-]{36}$/.test(value));
}

function storePhoto_(active,data) {
  if (typeof data !== "string" || data.length > 300000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw Error("Rasmni saqlab bo‘lmadi.");
  }
  const tab = active.getSheetByName("Rasmlar") || active.insertSheet("Rasmlar");
  const id = Utilities.getUuid();
  const chunks = data.match(/.{1,35000}/g);
  const row = tab.getRange(tab.getLastRow()+1,1,1,chunks.length+1);
  row.setNumberFormat("@").setValues([[id,...chunks.map(chunk => "."+chunk)]]);
  return "photo:"+id;
}

function readPhoto_(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Rasm topilmadi.");
  const tab = sheet("Rasmlar");
  if (!tab || !tab.getLastRow()) throw Error("Rasm topilmadi.");
  const match = tab.getRange(1,1,tab.getLastRow(),1).createTextFinder(id).matchEntireCell(true).findNext();
  if (!match) throw Error("Rasm topilmadi.");
  return tab.getRange(match.getRow(),2,1,tab.getLastColumn()-1).getDisplayValues()[0].map(chunk=>chunk.slice(1)).join("");
}

function menuSeed_() {
  return [
  [
    "1",
    "Sovuq gazaklar",
    "Хоровац из запечённых овощей",
    58000,
    "assets/menu-4-1.webp",
    "",
    true
  ],
  [
    "2",
    "Sovuq gazaklar",
    "Рулетики из баклажанов и кабачков",
    70000,
    "",
    "",
    true
  ],
  [
    "3",
    "Sovuq gazaklar",
    "Селёдочка с картофелем",
    60000,
    "",
    "",
    true
  ],
  [
    "4",
    "Sovuq gazaklar",
    "Домашний мясной холодец",
    90000,
    "",
    "",
    true
  ],
  [
    "5",
    "Sovuq gazaklar",
    "Рыбное ассорти",
    350000,
    "",
    "",
    true
  ],
  [
    "6",
    "Sovuq gazaklar",
    "Мясное ассорти",
    390000,
    "",
    "",
    true
  ],
  [
    "7",
    "Sovuq gazaklar",
    "Сырная тарелка",
    320000,
    "",
    "",
    true
  ],
  [
    "8",
    "Sovuq gazaklar",
    "Ассорти из свежих овощей",
    60000,
    "assets/menu-5-1.webp",
    "",
    true
  ],
  [
    "9",
    "Sovuq gazaklar",
    "Ассорти домашних разносолов",
    45000,
    "",
    "",
    true
  ],
  [
    "10",
    "Sovuq gazaklar",
    "Ассорти бочковых солений",
    55000,
    "",
    "",
    true
  ],
  [
    "11",
    "Sovuq gazaklar",
    "Лимон",
    20000,
    "",
    "",
    true
  ],
  [
    "12",
    "Sovuq gazaklar",
    "Сузьма",
    20000,
    "",
    "",
    true
  ],
  [
    "13",
    "Salatlar",
    "Салат «Аччик-чучук»",
    35000,
    "assets/menu-8-2.webp",
    "",
    true
  ],
  [
    "14",
    "Salatlar",
    "Салат «Цезарь» классический с курицей",
    85000,
    "assets/menu-8-1.webp",
    "",
    true
  ],
  [
    "15",
    "Salatlar",
    "Салат «Driada» с говядиной и гранатом",
    110000,
    "assets/menu-9-1.webp",
    "",
    true
  ],
  [
    "16",
    "Salatlar",
    "Салат «Японский»",
    75000,
    "assets/menu-9-2.webp",
    "",
    true
  ],
  [
    "17",
    "Salatlar",
    "Салат с хрустящими баклажанами и творожным сыром",
    80000,
    "assets/menu-10-1.webp",
    "",
    true
  ],
  [
    "18",
    "Salatlar",
    "Салат с тунцом",
    110000,
    "assets/menu-10-2.webp",
    "",
    true
  ],
  [
    "19",
    "Salatlar",
    "Салат «Burrata» с соусом песто",
    110000,
    "assets/menu-10-3.webp",
    "",
    true
  ],
  [
    "20",
    "Salatlar",
    "Салат «Лесная свежесть» с печёной свёклой и сыром страчателла",
    90000,
    "assets/menu-11-1.webp",
    "",
    true
  ],
  [
    "21",
    "Salatlar",
    "Салат «Греческий»",
    80000,
    "assets/menu-11-3.webp",
    "",
    true
  ],
  [
    "22",
    "Salatlar",
    "Салат «Под водочку»",
    70000,
    "assets/menu-11-2.webp",
    "",
    true
  ],
  [
    "23",
    "Issiq gazaklar",
    "Мозговая косточка",
    90000,
    "",
    "",
    true
  ],
  [
    "24",
    "Issiq gazaklar",
    "Мини-самса с говядиной и томатным соусом (6 шт.)",
    70000,
    "",
    "",
    true
  ],
  [
    "25",
    "Issiq gazaklar",
    "Горячая закуска от шефа",
    90000,
    "assets/menu-12-1.webp",
    "",
    true
  ],
  [
    "26",
    "Issiq gazaklar",
    "Фаршированный дунганский перец в кляре",
    90000,
    "",
    "",
    true
  ],
  [
    "27",
    "Issiq gazaklar",
    "Тигровые креветки в темпуре",
    150000,
    "",
    "",
    true
  ],
  [
    "28",
    "Gazaklar",
    "Бараньи семечки",
    70000,
    "assets/menu-14-1.webp",
    "",
    true
  ],
  [
    "29",
    "Gazaklar",
    "Гарлики чесночные",
    35000,
    "assets/menu-14-2.webp",
    "",
    true
  ],
  [
    "30",
    "Gazaklar",
    "Жареный сулугуни",
    30000,
    "",
    "",
    true
  ],
  [
    "31",
    "Gazaklar",
    "Слайсы из колбасок",
    30000,
    "",
    "",
    true
  ],
  [
    "32",
    "Gazaklar",
    "Луковые кольца в кляре",
    20000,
    "",
    "",
    true
  ],
  [
    "33",
    "Gazaklar",
    "Горячий сет к пенному",
    105000,
    "assets/menu-13-1.webp",
    "",
    true
  ],
  [
    "34",
    "Gazaklar",
    "Солёные косточки",
    30000,
    "",
    "",
    true
  ],
  [
    "35",
    "Gazaklar",
    "Сулугуни",
    25000,
    "",
    "",
    true
  ],
  [
    "36",
    "Gazaklar",
    "Курт",
    10000,
    "",
    "",
    true
  ],
  [
    "37",
    "Gazaklar",
    "Солёные фисташки",
    50000,
    "",
    "",
    true
  ],
  [
    "38",
    "Gazaklar",
    "Ассорти к пенному",
    70000,
    "",
    "",
    true
  ],
  [
    "39",
    "Sho‘rvalar",
    "Ароматная мастава по-домашнему",
    38000,
    "",
    "",
    true
  ],
  [
    "40",
    "Sho‘rvalar",
    "Суп с фрикадельками и домашней лапшой",
    35000,
    "",
    "",
    true
  ],
  [
    "41",
    "Sho‘rvalar",
    "Борщ из говядины",
    38000,
    "",
    "",
    true
  ],
  [
    "42",
    "Asosiy taomlar",
    "Smoky Bull – 1 кг",
    420000,
    "assets/menu-16-2.webp",
    "",
    true
  ],
  [
    "43",
    "Asosiy taomlar",
    "Вагури – 1 кг",
    400000,
    "assets/menu-16-1.webp",
    "",
    true
  ],
  [
    "44",
    "Asosiy taomlar",
    "Казан-кебаб из бычьего хвоста – 1 кг",
    380000,
    "",
    "Oldindan buyurtma",
    true
  ],
  [
    "45",
    "Asosiy taomlar",
    "Цыплёнок, томленный под сливочным маслом – 1 кг",
    100000,
    "",
    "",
    true
  ],
  [
    "46",
    "Asosiy taomlar",
    "Картофель по-домашнему с мясом",
    130000,
    "",
    "",
    true
  ],
  [
    "47",
    "Asosiy taomlar",
    "Блюдо от шефа",
    500000,
    "assets/menu-17-1.webp",
    "",
    true
  ],
  [
    "48",
    "Asosiy taomlar",
    "Томлёная баранья шейка «Байрам» – 1 кг",
    400000,
    "",
    "Oldindan buyurtma",
    true
  ],
  [
    "49",
    "Asosiy taomlar",
    "Тушенка – 1 кг",
    260000,
    "",
    "",
    true
  ],
  [
    "50",
    "Mangal",
    "Шашлык кусковой из молодой баранины",
    45000,
    "",
    "",
    true
  ],
  [
    "51",
    "Mangal",
    "Шашлык молотый «Кофта»",
    35000,
    "",
    "",
    true
  ],
  [
    "52",
    "Mangal",
    "Шашлык кусковой из говядины",
    45000,
    "assets/menu-21-1.webp",
    "",
    true
  ],
  [
    "53",
    "Mangal",
    "Шашлык из говяжьей печени",
    35000,
    "",
    "",
    true
  ],
  [
    "54",
    "Mangal",
    "Шашлык из куриных крылышек",
    30000,
    "",
    "",
    true
  ],
  [
    "55",
    "Mangal",
    "Шашлык из бараньей корейки «Чурраско»",
    120000,
    "",
    "",
    true
  ],
  [
    "56",
    "Mangal",
    "Домашние колбаски на мангале – баранина",
    52000,
    "",
    "",
    true
  ],
  [
    "57",
    "Mangal",
    "Домашние колбаски на мангале – говядина",
    49000,
    "",
    "",
    true
  ],
  [
    "58",
    "Mangal",
    "Домашние колбаски на мангале – курица",
    47000,
    "",
    "",
    true
  ],
  [
    "59",
    "Mangal",
    "Сет из домашних колбасок",
    105000,
    "assets/menu-20-1.webp",
    "",
    true
  ],
  [
    "60",
    "Mangal",
    "Перепёлка на шампурах «Чурраско»",
    125000,
    "assets/menu-20-2.webp",
    "",
    true
  ],
  [
    "61",
    "Baliq",
    "Жареный сазан – 1 кг",
    100000,
    "assets/menu-22-2.webp",
    "",
    true
  ],
  [
    "62",
    "Baliq",
    "Сазан «Чакак» – 1 кг",
    160000,
    "",
    "",
    true
  ],
  [
    "63",
    "Baliq",
    "Сазан на углях – 1 кг",
    100000,
    "assets/menu-22-1.webp",
    "",
    true
  ],
  [
    "64",
    "Steyklar",
    "Стейк T-bone – 100 г",
    70000,
    "assets/menu-23-2.webp",
    "",
    true
  ],
  [
    "65",
    "Steyklar",
    "Стейк Рибай на кости – 100 г",
    70000,
    "",
    "",
    true
  ],
  [
    "66",
    "Bolalar menyusi",
    "Smoky Burger Classic",
    60000,
    "",
    "",
    true
  ],
  [
    "67",
    "Bolalar menyusi",
    "Мясной конверт с сыром",
    60000,
    "",
    "",
    true
  ],
  [
    "68",
    "Garnirlar",
    "Овощной сет на мангале",
    65000,
    "assets/menu-24-1.webp",
    "",
    true
  ],
  [
    "69",
    "Garnirlar",
    "Картофель по-деревенски",
    40000,
    "",
    "",
    true
  ],
  [
    "70",
    "Garnirlar",
    "Классический картофель фри",
    30000,
    "",
    "",
    true
  ],
  [
    "71",
    "Garnirlar",
    "Домашние картофельные чипсы",
    25000,
    "",
    "",
    true
  ],
  [
    "72",
    "Non va souslar",
    "Хлебное ассорти",
    35000,
    "",
    "",
    true
  ],
  [
    "73",
    "Non va souslar",
    "Лепешка",
    8000,
    "",
    "",
    true
  ],
  [
    "74",
    "Non va souslar",
    "Томатный",
    19000,
    "",
    "",
    true
  ],
  [
    "75",
    "Non va souslar",
    "Тар-тар",
    19000,
    "",
    "",
    true
  ],
  [
    "76",
    "Non va souslar",
    "Сладкий чили",
    19000,
    "",
    "",
    true
  ]
];
}

