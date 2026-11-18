"use strict";
let tableOrderRecord = null;
let tableRequestId = null;
let tableRequestFingerprint = null;
let tableSending = false;
const serviceElement = id => document.getElementById(id);
window.openTableOrder = record => {
  if (!window.TABLE_ORDERS_ENABLED) return;
  tableOrderRecord = record;
  serviceElement("reservations").close();
  serviceElement("table-order-bar").hidden = false;
  serviceElement("table-order-label").textContent = "Stol "+record.table+" · Qo‘shimcha buyurtma";
  serviceElement("table-order-message").textContent = "Menyudan taom tanlang. Izohni tashrif tafsilotlarida yozing.";
  serviceElement("order-link").textContent = "Taomlar va izohlarni tekshirish";
  location.hash = "menu";
  api({action:"order.list",id:record.id}).then(result => {
    if (tableOrderRecord?.id !== record.id) return;
    serviceElement("table-order-message").textContent = result.orders.length ? result.orders.map(r=>r.status+" · "+r.order.items.map(i=>i.name+" × "+i.quantity).join(", ")).join(" | ") : "Menyudan taom tanlang.";
  }).catch(error=>{ serviceElement("table-order-message").textContent = error.message; });
};
serviceElement("leave-table-order").onclick = () => {
  if (tableSending) return;
  tableOrderRecord = null;
  serviceElement("table-order-bar").hidden = true;
  serviceElement("order-link").textContent = "Buyurtma bilan stol band qilish";
};
serviceElement("send-table-order").onclick = async () => {
  if (!window.TABLE_ORDERS_ENABLED || !tableOrderRecord || tableSending) return;
  const payload = orderPayload();
  if (!payload.length) { serviceElement("table-order-message").textContent = "Avval taom tanlang."; return; }
  const fingerprint = JSON.stringify([tableOrderRecord.id,payload]);
  if (fingerprint !== tableRequestFingerprint) { tableRequestId = crypto.randomUUID(); tableRequestFingerprint = fingerprint; }
  tableSending = true;
  serviceElement("send-table-order").disabled = true;
  try {
    const result = await api({action:"order.add",id:tableOrderRecord.id,requestId:tableRequestId,order:payload});
    if (!result.order && result.status !== "Yangi") throw Error("Buyurtma saqlangani tasdiqlanmadi. Qayta tekshiring.");
    order.clear(); orderNotes.clear(); renderOrder(); tableRequestFingerprint = null;
    serviceElement("table-order-message").textContent = "Buyurtma oshxonaga yuborildi!";
  } catch(error) { serviceElement("table-order-message").textContent = error.message; }
  finally { tableSending=false; serviceElement("send-table-order").disabled=false; }
};
window.previewTable = table => {
  serviceElement("preview-title").textContent = table.name+"-stol · "+table.capacity+" o‘rin · 360°";
  serviceElement("table-preview").showModal();
  window.tableScene.open(table,settings?.tables || window.HALL_TABLES || [table]);
};
const registrationDialog = serviceElement("registration");
const registrationTitle = serviceElement("registration-title");
const registrationMessage = serviceElement("registration-message");
const googleSignIn = serviceElement("google-signin");
const registrationFallback = serviceElement("register-open");
registrationFallback.onclick = () => {
  if (!registrationDialog.open) registrationDialog.showModal();
};
let googleConfigured = false;
window.setupGoogleRegistration = clientId => {
  if (googleConfigured) return;
  if (!clientId) {
    registrationMessage.textContent = "Google orqali kirish hali ulanmagan.";
    return;
  }
  googleConfigured = true;
  googleSignIn.setAttribute("aria-busy","true");
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  let observer;
  let timer;
  const failed = () => {
    clearTimeout(timer);
    observer?.disconnect();
    googleConfigured = false;
    googleSignIn.replaceChildren();
    googleSignIn.removeAttribute("aria-busy");
    registrationFallback.hidden = false;
    registrationTitle.textContent = "Google orqali ro‘yxatdan o‘tish";
    registrationMessage.textContent = "Google tugmasini yuklab bo‘lmadi. Internet aloqasini tekshirib, sahifani yangilang.";
    script.remove();
  };
  script.onerror = failed;
  timer = setTimeout(failed,15000);
  script.onload = () => {
    try {
      const identity = window.google?.accounts?.id;
      if (!identity) throw Error("Google kirish xizmati yuklanmadi.");
      identity.initialize({client_id:clientId,callback:async response => {
        registrationTitle.textContent = "Ro‘yxatdan o‘tilmoqda";
        registrationMessage.textContent = "Google hisobingiz tekshirilmoqda…";
        if (!registrationDialog.open) registrationDialog.showModal();
        try {
          const result = await api({action:"auth.google",credential:response.credential});
          if (result.ok !== true) throw Error("Ro‘yxatdan o‘tish tasdiqlanmadi.");
          registrationTitle.textContent = "Ro‘yxatdan o‘tdingiz!";
          registrationMessage.textContent = result.message || "Siz ro‘yxatdan o‘tdingiz! Bizning doimiy mijozimizga aylandingiz. Sizga rahmat!";
          if (result.name) serviceElement("customer").value = result.name;
        } catch (error) {
          registrationTitle.textContent = "Qayta urinib ko‘ring";
          registrationMessage.textContent = error.message;
        }
      }});
      const rendered = () => {
        if (!googleSignIn.querySelector("iframe, [role=button]")) return;
        clearTimeout(timer);
        observer?.disconnect();
        googleSignIn.removeAttribute("aria-busy");
        registrationFallback.hidden = true;
        registrationMessage.textContent = "Sahifa yuqorisidagi Google belgisini bosib, hisobingizni tanlang.";
      };
      observer = new MutationObserver(rendered);
      observer.observe(googleSignIn,{childList:true,subtree:true});
      identity.renderButton(googleSignIn,{type:"icon",theme:"outline",size:"large",shape:"circle",text:"signup_with"});
      rendered();
    } catch (error) {
      failed();
    }
  };
  document.head.append(script);
};
