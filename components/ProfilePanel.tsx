"use client";

import { upload } from "@imagekit/next";
import { doc, serverTimestamp, updateDoc, addDoc, collection } from "firebase/firestore";
import { ChangeEvent, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { useSession } from "./AuthGate";

export default function ProfilePanel(){
 const {profile,user}=useSession(); const [photo,setPhoto]=useState(profile?.photoUrl||""); const [loading,setLoading]=useState(false); const [message,setMessage]=useState("");
 async function choose(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0]; if(!file||!user)return; if(file.size>5*1024*1024){setMessage("A imagem deve ter no máximo 5 MB.");return} setLoading(true);setMessage("");try{const token=await auth.currentUser?.getIdToken();const authRes=await fetch("/api/imagekit-auth",{headers:{Authorization:`Bearer ${token}`}});if(!authRes.ok)throw new Error("Falha ao autorizar upload");const p=await authRes.json();const r=await upload({file,fileName:`profile_${user.uid}_${Date.now()}.${file.name.split('.').pop()||'jpg'}`,folder:"/agenda-gpv/perfis",...p});if(!r.url)throw new Error("Upload sem URL");await updateDoc(doc(db,"users",user.uid),{photoUrl:r.url,updatedAt:serverTimestamp()});await addDoc(collection(db,"auditLogs"),{userId:user.uid,userName:profile.name,userEmail:profile.email,action:"PROFILE_PHOTO_UPDATED",createdAt:serverTimestamp()});setPhoto(r.url);setMessage("Foto atualizada.")}catch(e){setMessage(e instanceof Error?e.message:"Erro no upload")}finally{setLoading(false)}}
 return <div className="panel"><div className="panel-head"><h2>Perfil</h2></div><div className="modal-body" style={{maxWidth:620}}><div style={{display:"flex",gap:18,alignItems:"center",marginBottom:22}}>{photo?<img className="profile-photo" src={photo} alt="Foto do perfil"/>:<div className="profile-photo" style={{display:"grid",placeItems:"center",fontWeight:900,fontSize:22}}>{profile.name?.[0]}</div>}<div><strong>{profile.name}</strong><div style={{color:"#777",fontSize:13,margin:"3px 0 10px"}}>{profile.email} • {profile.role}</div><label className="btn primary" style={{display:"inline-flex"}}>{loading?"Enviando...":"Alterar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} disabled={loading}/></label></div></div>{message&&<div className={message.includes("atualizada")?"success":"error"}>{message}</div>}<p style={{color:"#777",fontSize:13}}>As fotos de perfil são armazenadas no ImageKit. O Firebase guarda apenas a URL da imagem.</p></div></div>
}
