"use strict";
const el=id=>document.getElementById(id);
let kitchenKey="", kitchenOrders=[], kitchenFilter="active", kitchenBusy=false, kitchenTimer;
async function kitchenApi(data) {
  if (!window.BOOKING_ENDPOINT) throw Error("Oshxona serveri ulanmagan.");
  const response=await fetch(window.BOOKING_ENDPOINT,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({...data,key:kitchenKey}),signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw Error("Serverga ulanib bo‘lmadi.");
  const body=await response.json();
  if (!body.ok) throw Error(body.error === "Bron kodi yaroqsiz." ? "Oshpaz paneli uchun server yangilanishi kutilmoqda." : body.error);
  if (!Array.isArray(body.orders)) throw Error("Oshpaz paneli serverga hali ulanmagan.");
  return body;
}
function renderKitchen() {
  const board=el("kitchen-orders"); board.replaceChildren();
  const orders=kitchenOrders.filter(o=>kitchenFilter==="ready" ? o.status==="Tayyor" : o.status!=="Tayyor");
  if(!orders.length) board.textContent="Bu bo‘limda buyurtmalar yo‘q.";
  for(const order of orders) {
    const card=document.createElement("article"); card.className="card kitchen-ticket";
    const title=document.createElement("h2"); title.textContent="Stol "+order.table;
    const due=document.createElement("p"); due.className="kitchen-due";
    due.textContent="Tayyorlash vaqti: "+new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(order.due));
    const status=document.createElement("strong"); status.textContent=order.status;
    card.append(title,due,status);
    for(const item of order.order.items) {
      const row=document.createElement("div"); row.className="kitchen-dish";
      const image=document.createElement("img"); image.alt=item.name; image.loading="lazy";
      const source=item.image || "assets/dish-"+item.id+".webp";
      image.onerror=()=>image.remove();
      if (/^photo:[a-f0-9-]{36}$/i.test(source)) {
        resolvePhoto(source).then(url=>{ image.src=url; },()=>image.remove());
      } else if (/^(assets\/[a-z0-9.-]+|https:\/\/[^\s]+)$/i.test(source)) image.src=source;
      else image.hidden=true;
      const text=document.createElement("div"),name=document.createElement("h3"),note=document.createElement("p");
      name.textContent=item.name+" × "+item.quantity; note.className="kitchen-note"; note.textContent=item.note || "Maxsus izoh yo‘q";
      text.append(name,note); row.append(image,text); card.append(row);
    }
    if(order.status!=="Tayyor") {
      const button=document.createElement("button"); button.className="primary";
      button.textContent=order.status==="Yangi" ? "Tayyorlashni boshlash" : "Tayyor";
      button.disabled=kitchenBusy;
      button.onclick=()=>loadKitchen({action:"kitchen.update",orderId:order.id,status:order.status==="Yangi" ? "Tayyorlanmoqda" : "Tayyor"});
      card.append(button);
    }
    board.append(card);
  }
}
async function loadKitchen(data={action:"kitchen.list"}) {
  if(kitchenBusy) return false;
  kitchenBusy=true; renderKitchen();
  try {
    const result=await kitchenApi(data); kitchenOrders=result.orders;
    el("kitchen-message").textContent="Yangilandi · "+new Date().toLocaleTimeString("uz-UZ");
    return true;
  } catch(error) {
    const message=["TimeoutError","AbortError"].includes(error.name)
      ? "Server vaqtida javob bermadi. Internet aloqasini tekshirib, qayta urinib ko‘ring."
      : error.message;
    el("kitchen-message").textContent=message+(kitchenOrders.length ? " Oxirgi ko‘rinayotgan ma’lumot eskirgan bo‘lishi mumkin." : "");
    return false;
  }
  finally { kitchenBusy=false; renderKitchen(); }
}
el("kitchen-login").onsubmit=async event=> {
  event.preventDefault();
  if(kitchenBusy) return;
  const submit=el("kitchen-submit");
  kitchenKey=el("kitchen-key").value;
  submit.disabled=true; submit.textContent="Kirilmoqda…";
  el("kitchen-key").disabled=true;
  el("kitchen-message").textContent="Oshxona serveriga ulanmoqda…";
  try {
    if(await loadKitchen()) {
      el("kitchen-key").value=""; el("kitchen-login").hidden=true; el("kitchen-board").hidden=false;
      clearInterval(kitchenTimer); kitchenTimer=setInterval(()=>loadKitchen(),15000);
    } else kitchenKey="";
  } finally {
    submit.disabled=false; submit.textContent="Kirish";
    el("kitchen-key").disabled=false;
  }
};
el("kitchen-refresh").onclick=()=>loadKitchen();
el("kitchen-logout").onclick=()=> {
  kitchenKey=""; kitchenOrders=[]; clearInterval(kitchenTimer); renderKitchen();
  el("kitchen-board").hidden=true; el("kitchen-login").hidden=false; el("kitchen-message").textContent="";
};
for(const button of document.querySelectorAll("[data-filter]")) button.onclick=()=> {
  kitchenFilter=button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
  renderKitchen();
};
