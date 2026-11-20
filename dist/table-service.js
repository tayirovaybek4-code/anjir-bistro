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
  serviceElement("table-order-message").textContent = "Menyudan taom tanlang. Oshpazga izohni savatchada yozing.";
  serviceElement("order-link").textContent = "Taomlar va izohlarni tekshirish";
  serviceElement("preorder-title").textContent = "Qo‘shimcha buyurtma";
  render();renderOrder();
  location.hash = "menu";
  api({action:"order.list",id:record.id}).then(result => {
    if (tableOrderRecord?.id !== record.id) return;
    serviceElement("table-order-message").textContent = result.orders.length ? result.orders.map(r=>r.status+" · "+r.order.items.map(i=>i.name+" × "+i.quantity).join(", ")).join(" | ") : "Menyudan taom tanlang.";
  }).catch(error=>{ if (tableOrderRecord?.id === record.id) serviceElement("table-order-message").textContent = error.message; });
};
serviceElement("leave-table-order").onclick = () => {
  if (tableSending) return;
  tableOrderRecord = null;
  serviceElement("table-order-bar").hidden = true;
  serviceElement("order-link").textContent = "Buyurtma bilan stol band qilish";
  serviceElement("preorder-title").textContent = "Oldindan buyurtma";
  render();renderOrder();
};
serviceElement("send-table-order").onclick = async () => {
  if (!window.TABLE_ORDERS_ENABLED || !tableOrderRecord || tableSending) return;
  const payload = orderPayload();
  if (!payload.length) { serviceElement("table-order-message").textContent = "Avval taom tanlang."; return; }
  const fingerprint = JSON.stringify([tableOrderRecord.id,payload]);
  if (fingerprint !== tableRequestFingerprint) { tableRequestId = crypto.randomUUID(); tableRequestFingerprint = fingerprint; }
  tableSending = true;
  window.ORDER_SUBMITTING = true;renderOrder();
  serviceElement("send-table-order").disabled = true;
  try {
    const result = await api({action:"order.add",id:tableOrderRecord.id,requestId:tableRequestId,order:payload});
    if (!result.order && result.status !== "Yangi") throw Error("Buyurtma saqlangani tasdiqlanmadi. Qayta tekshiring.");
    order.clear(); orderNotes.clear(); renderOrder(); tableRequestFingerprint = null;
    serviceElement("table-order-message").textContent = "Buyurtma oshxonaga yuborildi!";
  } catch(error) { serviceElement("table-order-message").textContent = error.message; }
  finally { tableSending=false; window.ORDER_SUBMITTING=false;renderOrder();serviceElement("send-table-order").disabled=false; }
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
const customerSessionKey = "zarafshon-customer-session-v1";
let customerSession = null;
let customerProfile = null;
let customerSessionVersion = 0;
try {
  const stored = JSON.parse(localStorage.getItem(customerSessionKey) || "null");
  if (stored && /^[a-f0-9]{64}$/.test(stored.token || "") && stored.expiresAt>Date.now()) customerSession=stored;
} catch {}
window.customerSessionToken = () => customerSession?.expiresAt>Date.now() ? customerSession.token : "";
window.customerAccountProfile = () => customerProfile;
function updateCustomerButton() {
  const signedIn=Boolean(customerProfile);
  registrationFallback.classList.toggle("signed-in",signedIn);
  serviceElement("customer-register-label").hidden=signedIn;
  const avatar=serviceElement("customer-avatar"), initials=serviceElement("customer-initials");
  avatar.hidden=true; initials.hidden=!signedIn;
  registrationFallback.setAttribute("aria-label",signedIn ? "Mening kabinetim" : "Ro‘yxatdan o‘tish");
  registrationFallback.title=signedIn ? customerProfile.name+" · Mening kabinetim" : "Ro‘yxatdan o‘tish";
  if(signedIn) {
    initials.textContent=Array.from(customerProfile.name || customerProfile.email || "M")[0].toUpperCase();
    if(customerProfile.picture) {
      avatar.referrerPolicy="no-referrer";
      avatar.onload=()=>{if(customerProfile?.picture===avatar.getAttribute("src")){avatar.hidden=false;initials.hidden=true;}};
      avatar.onerror=()=>{avatar.hidden=true;initials.hidden=false;};
      avatar.src=customerProfile.picture;
    }
  } else { avatar.removeAttribute("src"); }
  serviceElement("customer-account").hidden=!signedIn;
  serviceElement("customer-profile-text").textContent=signedIn ? customerProfile.name+" · "+customerProfile.email : "";
  serviceElement("registration-manage").hidden=!signedIn;
  googleSignIn.hidden=signedIn;
}
window.clearCustomerAccount = () => {
  customerSessionVersion++;customerSession=null;customerProfile=null;
  try{localStorage.removeItem(customerSessionKey);}catch{}
  updateCustomerButton();
};
window.invalidateCustomerSession = token => {
  if(!token || customerSession?.token===token) window.clearCustomerAccount();
};
window.applyCustomerProfile = profile => {
  if(window.customerSessionToken() && profile?.id){customerProfile=profile;updateCustomerButton();}
};
window.restoreCustomerSession = async () => {
  if(!window.customerSessionToken()) return;
  const version=customerSessionVersion;
  registrationFallback.disabled=true;registrationFallback.setAttribute("aria-busy","true");
  try {
    const result=await api({action:"auth.session"});
    if(version!==customerSessionVersion) return;
    window.applyCustomerProfile(result.user);
    if(!serviceElement("customer").value && result.user.name)serviceElement("customer").value=result.user.name;
  } catch(error) {
    if(version===customerSessionVersion && error.code==="AUTH_REQUIRED")window.clearCustomerAccount();
  } finally {registrationFallback.disabled=false;registrationFallback.removeAttribute("aria-busy");}
};
window.openCustomerRegistration = () => {
  if(customerProfile && !window.customerSessionToken())window.clearCustomerAccount();
  if(customerProfile || window.customerSessionToken()) {window.openCustomerReservations();return;}
  registrationTitle.textContent="Ro‘yxatdan o‘tish";
  serviceElement("registration-manage").hidden=true;googleSignIn.hidden=false;
  if(!registrationDialog.open)registrationDialog.showModal();
};
registrationFallback.onclick=window.openCustomerRegistration;
serviceElement("registration-manage").onclick=()=>{registrationDialog.close();window.openCustomerReservations();};
serviceElement("customer-logout").onclick=async()=>{
  const button=serviceElement("customer-logout");button.disabled=true;
  try{await api({action:"auth.logout"});}catch{}
  finally{
    window.clearCustomerAccount();
    tableOrderRecord=null;serviceElement("table-order-bar").hidden=true;
    order.clear();orderNotes.clear();renderOrder();
    serviceElement("customer").value="";serviceElement("phone").value="";
    serviceElement("reservations").close();button.disabled=false;render();
  }
};
updateCustomerButton();
let googleConfigured = false;
window.setupGoogleRegistration = clientId => {
  if(googleConfigured || !clientId)return;
  googleConfigured=true;
  const button=document.createElement("button");button.type="button";button.className="outline";
  button.textContent="Google orqali ro‘yxatdan o‘tish";
  button.onclick=()=>{
    try{
      const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");
      const flow={state:random(),nonce:random(),expiresAt:Date.now()+600000};
      sessionStorage.setItem("zarafshon-google-flow",JSON.stringify(flow));
      sessionStorage.setItem("zarafshon-order-draft",JSON.stringify(orderPayload()));
      const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search=new URLSearchParams({client_id:clientId,redirect_uri:"https://tayirovaybek4-code.github.io/anjir-bistro/google-callback.html",response_type:"id_token",scope:"openid email profile",nonce:flow.nonce,state:flow.state,prompt:"select_account"}).toString();
      location.assign(url.href);
    }catch{registrationMessage.textContent="Brauzerda sayt ma’lumotlarini saqlashga ruxsat bering va qayta urinib ko‘ring.";}
  };
  googleSignIn.replaceChildren(button);
  registrationMessage.textContent="Google hisobingizni tanlang. Tasdiqlangach, saytdagi kabinetingizga qaytasiz.";
};
