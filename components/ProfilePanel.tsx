"use client";

import { doc, serverTimestamp, updateDoc, addDoc, collection } from "firebase/firestore";
import { Camera, ShieldCheck } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { useSession } from "./AuthGate";

export default function ProfilePanel(){
 const {profile,user}=useSession(); const [photo,setPhoto]=useState(profile?.photoUrl||""); const [loading,setLoading]=useState(false); const [message,setMessage]=useState("");
 if (!profile) return <div className="loading"><div className="spinner" /></div>;
 const currentProfile = profile;
 async function choose(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0]; if(!file||!user)return;
  if(file.size>5*1024*1024){setMessage("A imagem deve ter no máximo 5 MB.");return}
  setLoading(true);setMessage("");
  try{
   const token=await auth.currentUser?.getIdToken();
   const body=new FormData(); body.append("file",file);
   const res=await fetch("/api/cloudinary-upload",{method:"POST",headers:{Authorization:`Bearer ${token}`},body});
   const result=await res.json(); if(!res.ok||!result.url)throw new Error(result.error||"Falha ao enviar imagem");
   await updateDoc(doc(db,"users",user.uid),{photoUrl:result.url,updatedAt:serverTimestamp()});
   await addDoc(collection(db,"auditLogs"),{userId:user.uid,userName:currentProfile.name,userEmail:currentProfile.email,action:"PROFILE_PHOTO_UPDATED",createdAt:serverTimestamp()});
   setPhoto(result.url);setMessage("Foto atualizada com sucesso.");
  }catch(e){setMessage(e instanceof Error?e.message:"Erro no upload")}finally{setLoading(false)}
 }
 return <div className="panel profile-panel"><div className="panel-head"><div><h2>Meu perfil</h2><small>Informações do seu acesso ao portal</small></div></div><div className="profile-content"><div className="profile-hero"><div className="profile-avatar-wrap">{photo?<img className="profile-photo" src={photo} alt="Foto do perfil"/>:<div className="profile-photo profile-placeholder">{currentProfile.name?.[0]}</div>}<span className="profile-camera"><Camera size={15}/></span></div><div><h3>{currentProfile.name}</h3><p>{currentProfile.email}</p><div className="profile-department">{currentProfile.department || "Departamento não informado"}</div><div className="profile-badges"><span className={`pill ${currentProfile.role}`}>{currentProfile.role}</span><span className="pill active"><ShieldCheck size={12}/> acesso ativo</span></div></div></div><div className="profile-upload"><div><strong>Foto de perfil</strong><p>JPG, PNG ou WEBP com até 5 MB. A imagem é armazenada no Cloudinary.</p></div><label className="btn primary">{loading?"Enviando...":"Alterar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} disabled={loading}/></label></div>{message&&<div className={message.includes("sucesso")?"success":"error"}>{message}</div>}</div></div>
}
