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
    const settings = config();
    const day = event.parameter.day;
    const busy = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? records(sheet("Bronlar"))
      .filter(r=>holdsTable_(r) && r.day===day)
      .map(({table,start,duration})=>({table,start,duration})) : [];
    return json({ok:true,settings,busy});
  } catch (error) {
    console.error(error);
    return json({ok:false,error:"Bron tizimi vaqtincha ishlamayapti."});
  }
}

function doPost(event) {
  let lock;
  try {
    const input = JSON.parse(event.postData.contents);
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
    if (existing) return json({ok:holdsTable_(existing),status:existing.status,error:"Bron kodi ishlatilgan."});
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
    const row = tab.getRange(tab.getLastRow()+1,1,1,10);
    row.setNumberFormats([["@","@","@","@","0","0","@","@","@","0"]]);
    const safeName = /^[=+@-]/.test(name) ? "'"+name : name;
    const status = PropertiesService.getScriptProperties().getProperty("TELEGRAM_APPROVALS") === "on" ? "Kutilmoqda" : "Band";
    row.setValues([[input.id,new Date().toISOString(),input.day,input.hour,table.id,input.guests,safeName,"'"+phone,status,settings.duration]]);
    SpreadsheetApp.flush();
    lock.releaseLock();
    lock = null;
    notifyNewBooking_({ id: input.id, status, day: input.day, hour: input.hour, table: table.name, guests: input.guests });
    return json({ok:true,status});
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
  const html = HtmlService.createHtmlOutput(
    '<base target="_top"><style>body{font:15px system-ui;padding:16px}button{display:block;margin:12px 0;padding:10px}</style>' +
    '<h2>Anjir Bistro</h2><p>Kerakli bo‘limni tanlang va jadvaldagi qiymatlarni tahrirlang.</p>' +
    '<button onclick="google.script.run.adminTab(\'Bronlar\')">Bronlar va holatlar</button>' +
    '<button onclick="google.script.run.adminTab(\'Stollar\')">Stollar va sig‘im</button>' +
    '<button onclick="google.script.run.adminTab(\'Sozlamalar\')">Restoran va ish vaqti</button>');
  SpreadsheetApp.getUi().showSidebar(html.setTitle("Admin panel"));
}

function adminTab(name) {
  if (!["Bronlar","Stollar","Sozlamalar"].includes(name)) return;
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name).activate();
}
