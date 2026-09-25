const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let session = null;
let profile = null;

const $ = (id) => document.getElementById(id);

function tick() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  const ms = next - now;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  $("tick").textContent = `next fold in ${m}m ${String(s).padStart(2, "0")}s`;
}

function openSheet(id) {
  $("desk").hidden = id !== "desk";
  $("auth").hidden = id !== "auth";
}
function closeSheets() {
  $("desk").hidden = true;
  $("auth").hidden = true;
}

document.querySelectorAll("[data-open]").forEach((b) => {
  b.addEventListener("click", () => {
    const t = b.dataset.open;
    if (t === "wall") {
      $("wall").scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (t === "desk" && !session) return openSheet("auth");
    openSheet(t);
  });
});
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
$("authBtn").addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    return;
  }
  openSheet("auth");
});

async function loadHour() {
  const { data } = await sb
    .from("meridian_hours")
    .select("*, meridian_notes(title, body, author_id)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return;
  $("hourKicker").textContent = data.kicker || "This hour";
  $("hourTitle").textContent = data.title;
  $("hourBody").textContent = data.body;
  const feat = data.meridian_notes;
  if (feat) {
    $("featured").hidden = false;
    $("featTitle").textContent = feat.title;
    $("featBody").textContent = feat.body;
    $("featBy").textContent = "A public slip, held for the hour.";
  } else {
    $("featured").hidden = true;
  }
}

async function loadWall() {
  const { data } = await sb
    .from("meridian_notes")
    .select("id, title, body, created_at, author_id")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(36);
  const box = $("publicList");
  box.innerHTML = "";
  if (!data || !data.length) {
    box.innerHTML = "<p class='hint'>The wall is empty. First public slip sets the tone.</p>";
    return;
  }
  data.forEach((n, i) => {
    const el = document.createElement("article");
    el.className = "card";
    el.style.animationDelay = `${i * 40}ms`;
    el.innerHTML = `<h3></h3><p></p><p class="meta"></p>`;
    el.querySelector("h3").textContent = n.title;
    el.querySelector("p").textContent = n.body.length > 280 ? n.body.slice(0, 277) + "…" : n.body;
    el.querySelector(".meta").textContent = new Date(n.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    box.appendChild(el);
  });
}

async function loadMine() {
  if (!session) {
    $("noteForm").hidden = true;
    $("deskHint").textContent = "Sign in to keep slips.";
    $("mine").innerHTML = "";
    return;
  }
  $("noteForm").hidden = false;
  $("deskHint").textContent = profile ? `Signed in as ${profile.handle}` : "Your slips stay here. Public ones also go on the wall.";
  const { data } = await sb
    .from("meridian_notes")
    .select("*")
    .eq("author_id", session.user.id)
    .order("created_at", { ascending: false });
  const box = $("mine");
  box.innerHTML = "";
  (data || []).forEach((n) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `<h3></h3><p></p><p class="meta"></p><button class="tiny" type="button">Delete</button>`;
    el.querySelector("h3").textContent = n.title;
    el.querySelector("p").textContent = n.body;
    el.querySelector(".meta").textContent = (n.is_public ? "Public · " : "Private · ") + new Date(n.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
    el.querySelector("button").onclick = async () => {
      await sb.from("meridian_notes").delete().eq("id", n.id);
      loadMine();
      loadWall();
    };
    box.appendChild(el);
  });
}

$("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(e.target);
  const row = {
    author_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  };
  const { error } = await sb.from("meridian_notes").insert(row);
  if (error) return alert(error.message);
  e.target.reset();
  loadMine();
  loadWall();
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = e.submitter?.dataset.mode || "in";
  const fd = new FormData(e.target);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  const handle = String(fd.get("handle") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  $("authErr").hidden = true;
  let error;
  if (mode === "up") {
    if (handle.length < 3) {
      $("authErr").textContent = "Pick a handle, 3–24 characters.";
      $("authErr").hidden = false;
      return;
    }
    const res = await sb.auth.signUp({ email, password });
    error = res.error;
    if (!error && res.data.user) {
      await sb.from("meridian_profiles").insert({
        id: res.data.user.id,
        handle,
        display_name: handle,
      });
    }
  } else {
    const res = await sb.auth.signInWithPassword({ email, password });
    error = res.error;
  }
  if (error) {
    $("authErr").textContent = error.message;
    $("authErr").hidden = false;
    return;
  }
  closeSheets();
});

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  profile = null;
  if (session) {
    const p = await sb.from("meridian_profiles").select("*").eq("id", session.user.id).maybeSingle();
    profile = p.data;
    $("authBtn").textContent = "Sign out";
  } else {
    $("authBtn").textContent = "Sign in";
  }
  loadMine();
}

sb.auth.onAuthStateChange(() => refreshAuth());

async function boot() {
  tick();
  setInterval(tick, 1000);
  await refreshAuth();
  await Promise.all([loadHour(), loadWall()]);
  setInterval(() => {
    const n = new Date();
    if (n.getMinutes() === 0 && n.getSeconds() < 3) {
      loadHour();
      loadWall();
    }
  }, 1000);
}

boot();
