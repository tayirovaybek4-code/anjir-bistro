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
serviceElement("register-open").onclick = () => serviceElement("registration").showModal();
let googleConfigured = false;
window.setupGoogleRegistration = clientId => {
  if (googleConfigured) return;
  if (!clientId) { serviceElement("registration-message").textContent="Google orqali kirish hali ulanmagan."; return; }
  googleConfigured=true;
  const script=document.createElement("script"); script.src="https://accounts.google.com/gsi/client";
  script.onerror=()=> { googleConfigured=false; serviceElement("registration-message").textContent="Google yuklanmadi. Sahifani yangilang."; };
  script.onload=()=> {
    google.accounts.id.initialize({client_id:clientId,callback:async response=> {
      serviceElement("registration-message").textContent="Ro‘yxatdan o‘tilmoqda…";
      try {
        const result=await api({action:"auth.google",credential:response.credential});
        serviceElement("registration-message").textContent=result.message;
        if(result.name) serviceElement("customer").value=result.name;
      } catch(error) { serviceElement("registration-message").textContent=error.message; }
    }});
    google.accounts.id.renderButton(serviceElement("google-signin"),{theme:"outline",size:"large",text:"signup_with"});
    serviceElement("registration-message").textContent="Google hisobingiz bilan ro‘yxatdan o‘ting.";
  };
  document.head.append(script);
};
