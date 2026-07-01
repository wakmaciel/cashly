/* =========================================================
   CASHLY — gdrive-backup.js
   Backup automático (1x por sessão/dia) no Google Drive do usuário.

   Estratégia:
   - Login via Google Identity Services (GIS), fluxo "token client" —
     não precisa de backend, funciona 100% em site estático (GitHub Pages).
   - Arquivo salvo na pasta especial "appDataFolder" do Drive: invisível
     no Drive normal do usuário, isolado por app, e o escopo
     'drive.file' garante que o Cashly só enxerga o que ele mesmo criou.
   - Conflito entre dispositivos: "mais recente vence" comparando o
     campo updatedAt salvo dentro do próprio backup.
   - Sem dependências de build: carrega o script do Google via <script> tag.
========================================================= */
(function(){
"use strict";

/* ⚠️ Troque pelo Client ID criado no Google Cloud Console para o Cashly
   (Credentials → OAuth Client ID → Web application). Não reutilize o
   Client ID de outro app: crie um novo, mesmo que no mesmo projeto GCP. */
const CLIENT_ID = "863627508865-12fdmalirlh909s3j63orvhms3u55297.apps.googleusercontent.com";

const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
const BACKUP_FILENAME = "cashly-backup.json";
const TOKEN_STORAGE_KEY = "cashly:gdrive:token";
const LAST_SYNC_KEY = "cashly:gdrive:lastSync";
const CONNECTED_KEY = "cashly:gdrive:connected";
const AUTO_SYNC_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~1x por dia/sessão (20h de folga)

let tokenClient = null;
let accessToken = null;
let accessTokenExpiresAt = 0;
let gisReady = false;
let gapiReady = false;
let syncing = false;
let backupFileId = null; // cache do id do arquivo no appDataFolder

function $(sel, ctx){ return (ctx||document).querySelector(sel); }

/* ---------- carregamento dos scripts do Google (GIS + gapi client) ---------- */
function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve;
    s.onerror = ()=> reject(new Error("Falha ao carregar " + src));
    document.head.appendChild(s);
  });
}

async function ensureGoogleScripts(){
  const tasks = [];
  if(!window.google || !window.google.accounts){
    tasks.push(loadScript("https://accounts.google.com/gsi/client"));
  }
  if(!window.gapi){
    tasks.push(loadScript("https://apis.google.com/js/api.js"));
  }
  if(tasks.length) await Promise.all(tasks);

  if(!gapiReady){
    await new Promise((resolve)=> window.gapi.load("client", resolve));
    await window.gapi.client.init({});
    await window.gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    gapiReady = true;
  }
  gisReady = true;
}

/* ---------- gerenciamento de token ---------- */
function saveToken(token, expiresInSec){
  accessToken = token;
  accessTokenExpiresAt = Date.now() + (expiresInSec*1000) - 60000; // margem de 1min
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt: accessTokenExpiresAt, scope: SCOPES }));
}
function loadCachedToken(){
  try{
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if(!raw) return null;
    const { token, expiresAt, scope } = JSON.parse(raw);
    // se o escopo mudou desde a última vez (ex: ajuste de configuração), descarta o token antigo
    if(scope !== SCOPES) return null;
    if(Date.now() >= expiresAt) return null;
    accessToken = token;
    accessTokenExpiresAt = expiresAt;
    return token;
  }catch(e){ return null; }
}
function clearToken(){
  accessToken = null; accessTokenExpiresAt = 0;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
function isConnected(){
  return localStorage.getItem(CONNECTED_KEY) === "1";
}
function setConnected(val){
  if(val) localStorage.setItem(CONNECTED_KEY, "1");
  else localStorage.removeItem(CONNECTED_KEY);
  updateStatusUI();
}

/* Obtém um access token válido, pedindo consentimento se necessário.
   silent=true tenta sem popup (para sync automático em segundo plano). */
function getAccessToken(silent){
  return new Promise((resolve, reject)=>{
    const cached = loadCachedToken();
    if(cached){ resolve(cached); return; }

    if(!tokenClient){
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: ()=>{} // sobrescrito por chamada
      });
    }
    tokenClient.callback = (resp)=>{
      if(resp.error){ reject(new Error(resp.error)); return; }
      saveToken(resp.access_token, resp.expires_in || 3600);
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err)=> reject(err);
    tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
  });
}

/* ---------- chamadas à Drive API (appDataFolder) ---------- */
function driveHeaders(){
  return { "Authorization": "Bearer " + accessToken };
}

async function driveErrorMessage(res){
  try{
    const data = await res.json();
    const msg = data && data.error && (data.error.message || data.error.status);
    return msg ? `${res.status} — ${msg}` : String(res.status);
  }catch(e){
    return String(res.status);
  }
}

async function findBackupFile(){
  if(backupFileId) return backupFileId;
  const url = "https://www.googleapis.com/drive/v3/files"
    + "?spaces=appDataFolder&q=" + encodeURIComponent(`name='${BACKUP_FILENAME}'`)
    + "&fields=files(id,name,modifiedTime)";
  const res = await fetch(url, { headers: driveHeaders() });
  if(!res.ok) throw new Error("Falha ao consultar arquivos no Drive (" + await driveErrorMessage(res) + ")");
  const data = await res.json();
  if(data.files && data.files.length){
    backupFileId = data.files[0].id;
    return backupFileId;
  }
  return null;
}

async function downloadBackup(){
  const fileId = await findBackupFile();
  if(!fileId) return null;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: driveHeaders()
  });
  if(!res.ok) throw new Error("Falha ao baixar backup (" + await driveErrorMessage(res) + ")");
  return res.json();
}

async function uploadBackup(payload){
  const fileId = await findBackupFile();
  const boundary = "cashly_backup_boundary";
  const metadata = { name: BACKUP_FILENAME, mimeType: "application/json" };
  if(!fileId) metadata.parents = ["appDataFolder"];

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(payload) + `\r\n` +
    `--${boundary}--`;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const method = fileId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: Object.assign(driveHeaders(), { "Content-Type": `multipart/related; boundary=${boundary}` }),
    body
  });
  if(!res.ok) throw new Error("Falha ao enviar backup (" + await driveErrorMessage(res) + ")");
  const data = await res.json();
  backupFileId = data.id;
  return data;
}

/* ---------- fluxo principal de sincronização ---------- */
function nowIso(){ return new Date().toISOString(); }

async function syncNow(opts){
  opts = opts || {};
  if(syncing) return;
  if(!window.CashlyCore){ console.warn("CashlyCore não encontrado — carregue gdrive-backup.js depois do app.js"); return; }
  syncing = true;
  updateStatusUI("Sincronizando…");

  try{
    await ensureGoogleScripts();
    await getAccessToken(opts.silent !== false);

    const remote = await downloadBackup();
    const localState = window.CashlyCore.getState();
    const localUpdatedAt = window.CashlyCore.getUpdatedAt();

    if(remote && remote.updatedAt && remote.updatedAt > localUpdatedAt){
      // remoto é mais novo (ex: outro dispositivo salvou depois) → restaura local
      window.CashlyCore.replaceState(remote.data);
      window.CashlyCore.toast("Dados restaurados do backup na nuvem");
    } else {
      // local é igual ou mais novo → envia para o Drive
      await uploadBackup({ updatedAt: localUpdatedAt || Date.now(), data: localState });
    }

    localStorage.setItem(LAST_SYNC_KEY, nowIso());
    setConnected(true);
    updateStatusUI();
  }catch(err){
    console.error("Erro na sincronização com o Google Drive:", err);
    const detail = (err && err.message) || "erro desconhecido";
    updateStatusUI("Erro ao sincronizar: " + detail);
    if(window.CashlyCore) window.CashlyCore.toast("Falha ao sincronizar: " + detail);
    throw err;
  }finally{
    syncing = false;
  }
}

async function connect(){
  try{
    await ensureGoogleScripts();
    await getAccessToken(false); // false = mostra o popup de consentimento
    setConnected(true);
    await syncNow({ silent: true });
  }catch(err){
    console.error("Erro ao conectar ao Google Drive:", err);
    const reason = describeConnectError(err);
    if(window.CashlyCore) window.CashlyCore.toast("Google Drive: " + reason);
    updateStatusUI("Falha ao conectar — " + reason);
  }
}

function describeConnectError(err){
  const msg = (err && (err.message || err.type || err.error || String(err))) || "erro desconhecido";
  if(msg.includes("popup_closed") || msg.includes("popup_failed_to_open")){
    return "a janela de login foi bloqueada ou fechada. Permita pop-ups para este site e tente de novo.";
  }
  if(msg.includes("access_denied")){
    return "acesso negado. Se o app ainda está em modo de teste no Google Cloud, sua conta precisa estar na lista de 'Test users'.";
  }
  if(msg.includes("idpiframe_initialization_failed") || msg.includes("origin")){
    return "a origem deste site não está autorizada no Google Cloud Console (verifique 'Authorized JavaScript origins').";
  }
  if(msg.includes("invalid_client")){
    return "Client ID inválido ou não corresponde a este domínio.";
  }
  return msg;
}

function disconnect(){
  const token = accessToken;
  clearToken();
  setConnected(false);
  backupFileId = null;
  if(token && window.google && google.accounts && google.accounts.oauth2){
    google.accounts.oauth2.revoke(token, ()=>{});
  }
  if(window.CashlyCore) window.CashlyCore.toast("Google Drive desconectado");
}

/* Decide se deve rodar sync automático agora (no máx. ~1x por dia/sessão) */
function maybeAutoSync(){
  if(!isConnected()) return;
  const last = localStorage.getItem(LAST_SYNC_KEY);
  const lastTs = last ? new Date(last).getTime() : 0;
  if(Date.now() - lastTs < AUTO_SYNC_MIN_INTERVAL_MS) return;
  syncNow({ silent: true }).catch(()=>{ /* já logado dentro de syncNow */ });
}

/* ---------- UI ---------- */
function formatLastSync(){
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  if(!raw) return "Nunca sincronizado";
  const d = new Date(raw);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
  if(sameDay) return "Hoje às " + time;
  return d.toLocaleDateString("pt-BR") + " às " + time;
}

function updateStatusUI(overrideText){
  const statusEl = $("#gdriveStatus");
  const rowEl = $("#gdriveMenuRow");
  const connectBtn = $("#gdriveConnectBtn");
  const disconnectBtn = $("#gdriveDisconnectBtn");
  const syncNowBtn = $("#gdriveSyncNowBtn");
  if(!statusEl) return; // HTML ainda não carregado / elementos ausentes

  const connected = isConnected();
  if(rowEl) rowEl.querySelector(".mt-value").textContent = connected ? "Conectado" : "Desconectado";
  if(connectBtn) connectBtn.classList.toggle("page-hidden", connected);
  if(disconnectBtn) disconnectBtn.classList.toggle("page-hidden", !connected);
  if(syncNowBtn) syncNowBtn.classList.toggle("page-hidden", !connected);

  statusEl.textContent = overrideText || (connected
    ? "Última sincronização: " + formatLastSync()
    : "Conecte sua conta Google para manter um backup automático na nuvem.");
}

function openGDriveSheet(){
  updateStatusUI();
  document.getElementById("sheetGDrive").classList.add("show");
}

/* ---------- inicialização ---------- */
function wireUI(){
  const openBtn = $("#gdriveMenuRow");
  if(openBtn) openBtn.addEventListener("click", openGDriveSheet);

  const connectBtn = $("#gdriveConnectBtn");
  if(connectBtn) connectBtn.addEventListener("click", connect);

  const disconnectBtn = $("#gdriveDisconnectBtn");
  if(disconnectBtn) disconnectBtn.addEventListener("click", ()=>{
    if(confirm("Desconectar do Google Drive? O backup automático será interrompido (os dados locais no aparelho continuam intactos).")){
      disconnect();
    }
  });

  const syncNowBtn = $("#gdriveSyncNowBtn");
  if(syncNowBtn) syncNowBtn.addEventListener("click", ()=> syncNow({ silent: false }).catch(()=>{}));

  updateStatusUI();
}

function init(){
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
    return;
  }
  wireUI();
  // dispara um sync automático (respeitando o intervalo mínimo) ao abrir o app
  maybeAutoSync();
  // e também quando o estado local mudar bastante tempo depois (ex: app fica aberto o dia todo)
  document.addEventListener("cashly:changed", ()=>{
    // não sincroniza a cada tecla digitada — só reavalia o intervalo diário
    maybeAutoSync();
  });
}
init();

})();
