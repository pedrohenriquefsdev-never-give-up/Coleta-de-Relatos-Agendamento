import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,"\n");
if(!projectId||!clientEmail||!privateKey){console.error("Configure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY.");process.exit(1)}
const app=getApps()[0]||initializeApp({credential:cert({projectId,clientEmail,privateKey})});
const auth=getAuth(app); const db=getFirestore(app); const rl=readline.createInterface({input,output});
const name=(await rl.question("Nome do administrador: ")).trim();
const email=(await rl.question("E-mail: ")).trim().toLowerCase();
const cpf=(await rl.question("CPF (11 dígitos): ")).replace(/\D/g,""); rl.close();
if(!name||!email||cpf.length!==11){console.error("Dados inválidos.");process.exit(1)}
let user; try{user=await auth.getUserByEmail(email);await auth.updateUser(user.uid,{password:cpf,displayName:name,disabled:false});}catch(e){if(e.code!=="auth/user-not-found")throw e;user=await auth.createUser({email,password:cpf,displayName:name});}
await db.collection("users").doc(user.uid).set({uid:user.uid,name,email,role:"admin",active:true,cpfLast4:cpf.slice(-2),createdAt:FieldValue.serverTimestamp()},{merge:true});
console.log(`Administrador criado/atualizado: ${email}`);
