import { NextRequest } from "next/server";
import { getUploadAuthParams } from "@imagekit/next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req:NextRequest){try{const h=req.headers.get("authorization");if(!h?.startsWith("Bearer "))return Response.json({error:"Não autorizado"},{status:401});const decoded=await adminAuth().verifyIdToken(h.slice(7));const user=await adminDb().collection("users").doc(decoded.uid).get();if(!user.exists||user.data()?.active===false)return Response.json({error:"Acesso bloqueado"},{status:403});const publicKey=process.env.IMAGEKIT_PUBLIC_KEY;const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;if(!publicKey||!privateKey)return Response.json({error:"ImageKit não configurado"},{status:500});const {token,expire,signature}=getUploadAuthParams({publicKey,privateKey});return Response.json({token,expire,signature,publicKey});}catch{return Response.json({error:"Não autorizado"},{status:401})}}
