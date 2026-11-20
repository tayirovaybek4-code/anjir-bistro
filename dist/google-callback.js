"use strict";
(async()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 history.replaceState(null,"",location.pathname);
 const status=document.getElementById("status");
 try{
  const flow=JSON.parse(sessionStorage.getItem("zarafshon-google-flow") || "null");
  sessionStorage.removeItem("zarafshon-google-flow");
  if(params.get("error"))throw Error("Google orqali kirish bekor qilindi. Saytga qaytib, yana urinib ko‘ring.");
  const credential=params.get("id_token");
  if(!flow || flow.expiresAt<Date.now() || params.get("state")!==flow.state || !credential)throw Error("Kirish muddati tugagan. Saytdan ro‘yxatdan o‘tishni qayta boshlang.");
  const body=credential.split(".")[1];
  const claims=JSON.parse(atob(body.replace(/-/g,"+").replace(/_/g,"/")));
  if(claims.nonce!==flow.nonce)throw Error("Google kirish so‘rovi mos kelmadi. Qayta boshlang.");
  // Claims are untrusted here; the server verifies the complete Google token.
  const response=await fetch(window.BOOKING_ENDPOINT,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"auth.google",credential}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error("Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.");
  const result=await response.json();
  if(!result.ok || !/^[a-f0-9]{64}$/.test(result.sessionToken || "") || !(result.sessionExpiresAt>Date.now()))throw Error(result.error || "Kirish tasdiqlanmadi.");
  localStorage.setItem("zarafshon-customer-session-v1",JSON.stringify({token:result.sessionToken,expiresAt:result.sessionExpiresAt}));
  status.textContent=result.message;
  location.replace("index.html#site-start");
 }catch(error){status.textContent=["TimeoutError","AbortError"].includes(error.name)?"Server vaqtida javob bermadi. Saytga qaytib, qayta urinib ko‘ring.":error.message;}
})();
